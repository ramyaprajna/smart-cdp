/**
 * Secure Refresh State Management Hook
 *
 * Provides robust refresh functionality with:
 * - Race condition prevention
 * - Error handling and recovery
 * - Performance optimization
 * - Timeout protection
 * - Animation state management
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface UseSecureRefreshOptions {
  timeoutMs?: number;
  debounceMs?: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface SecureRefreshState {
  isRefreshing: boolean;
  isComplete: boolean;
  error: string | null;
  startTime: number | null;
  duration: number | null;
}

export function useSecureRefresh(
  refreshFn: (signal?: AbortSignal) => Promise<void>,
  options: UseSecureRefreshOptions = {}
) {
  const {
    timeoutMs = 30000,
    debounceMs = 1000,
    onSuccess,
    onError
  } = options;

  // State management
  const [state, setState] = useState<SecureRefreshState>({
    isRefreshing: false,
    isComplete: false,
    error: null,
    startTime: null,
    duration: null
  });

  // Refs for cleanup and race condition prevention
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup function
  const cleanup = useCallback((currentController: AbortController) => {
    // Only cleanup if this is still the current operation
    if (abortControllerRef.current === currentController) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortControllerRef.current = null;
    }
  }, []);

  // Secure refresh function with comprehensive error handling
  const executeRefresh = useCallback(async () => {
    const now = Date.now();

    // Debounce rapid consecutive calls
    if (now - lastCallRef.current < debounceMs) {
      return;
    }
    lastCallRef.current = now;

    // Cancel any existing operation and create new controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const currentController = new AbortController();
    abortControllerRef.current = currentController;
    const startTime = now;

    // Set loading state
    setState(prev => ({
      ...prev,
      isRefreshing: true,
      isComplete: false,
      error: null,
      startTime,
      duration: null
    }));

    // Setup timeout protection
    timeoutRef.current = setTimeout(() => {
      if (abortControllerRef.current === currentController) {
        // Abort the operation to fully cancel it
        currentController.abort();

        const sanitizedError = "Refresh operation timed out. Please try again.";
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          isComplete: false,
          error: sanitizedError,
          duration: timeoutMs
        }));
        if (onError) {
          onError(sanitizedError);
        }
        cleanup(currentController);
      }
    }, timeoutMs);

    try {
      // Execute the refresh function with abort signal
      await refreshFn(currentController.signal);

      // Only update state if this operation is still current
      if (abortControllerRef.current === currentController) {
        const duration = Date.now() - startTime;
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          isComplete: true,
          error: null,
          duration
        }));
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (error) {
      // Only handle error if this operation is still current
      if (abortControllerRef.current === currentController) {
        // Sanitize error message for security
        const sanitizedError = error instanceof Error
          ? "Failed to refresh data. Please try again."
          : "An unexpected error occurred during refresh.";

        const duration = Date.now() - startTime;
        setState(prev => ({
          ...prev,
          isRefreshing: false,
          isComplete: false,
          error: sanitizedError,
          duration
        }));
        if (onError) {
          onError(sanitizedError);
        }
      }
    } finally {
      cleanup(currentController);
    }
  }, [refreshFn, debounceMs, timeoutMs, onSuccess, onError, cleanup]);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Reset complete state
  const resetComplete = useCallback(() => {
    setState(prev => ({ ...prev, isComplete: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      abortControllerRef.current = null;
    };
  }, []);

  return {
    ...state,
    refresh: executeRefresh,
    clearError,
    resetComplete
  };
}

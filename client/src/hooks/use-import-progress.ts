/**
 * Custom hook for managing import progress tracking
 * Handles progress polling, session management, and state updates
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ImportProgress, ImportStats } from '@/hooks/use-data-import';
import { useImportErrorHandler } from '@/utils/import-error-handling';

export const useImportProgress = () => {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const progressPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressPollingAbortControllerRef = useRef<AbortController | null>(null);
  const { handleError, showSuccessMessage } = useImportErrorHandler();

  // Start progress polling for a session
  const startProgressPolling = useCallback((sessionId: string) => {


    // Clear any existing polling and abort controllers
    if (progressPollingIntervalRef.current) {
      clearInterval(progressPollingIntervalRef.current);
      progressPollingIntervalRef.current = null;
    }
    if (progressPollingAbortControllerRef.current) {
      progressPollingAbortControllerRef.current.abort();
      progressPollingAbortControllerRef.current = null;
    }

    // Create new AbortController for this polling session
    const abortController = new AbortController();
    progressPollingAbortControllerRef.current = abortController;

    const pollProgress = async () => {
      try {
        // Check if we should abort before making the request
        if (abortController.signal.aborted) {

          return;
        }

        const response = await fetch(`/api/imports/${sessionId}/progress`, {
          signal: abortController.signal
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const progressData = result;

            setImportProgress({
              totalRecords: progressData.totalRecords,
              processedRecords: progressData.processedRecords,
              successfulRecords: progressData.successfulRecords,
              failedRecords: progressData.failedRecords,
              currentBatch: progressData.currentBatch,
              totalBatches: progressData.totalBatches,
              startTime: new Date(progressData.startTime),
              lastUpdateTime: new Date(progressData.lastUpdateTime),
              estimatedCompletion: progressData.estimatedCompletion ? new Date(progressData.estimatedCompletion) : undefined,
              processingSpeed: progressData.processingSpeed,
              status: progressData.status,
              importSessionId: progressData.importSessionId,
              currentOperation: progressData.currentOperation,
              lastProcessedRecord: progressData.lastProcessedRecord,
              duplicatesHandled: progressData.duplicatesHandled,
              canResume: progressData.canResume
            });

            // Stop polling if completed
            if (progressData.status === 'completed' || progressData.status === 'error') {

              // Comprehensive cleanup
              if (progressPollingIntervalRef.current) {
                clearInterval(progressPollingIntervalRef.current);
                progressPollingIntervalRef.current = null;
              }
              if (progressPollingAbortControllerRef.current) {
                progressPollingAbortControllerRef.current.abort();
                progressPollingAbortControllerRef.current = null;
              }

              if (progressData.status === 'completed') {
                showSuccessMessage(
                  "Import completed",
                  `Successfully imported ${progressData.successfulRecords} out of ${progressData.processedRecords} records`
                );
                return progressData;
              } else {
                handleError(progressData.errorMessage || 'Import failed', 'Progress Polling');
                return null;
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ [Progress Polling] Error:', error);

        // Handle AbortError - this is expected when cancelling
        if (error instanceof Error && error.name === 'AbortError') {

          return;
        }

        // Handle specific error types
        if (error instanceof TypeError && error.message.includes('fetch')) {
          // Network error - continue polling, might be temporary
          return;
        }
        if ((error as any)?.status === 404) {
          // Session not found - stop polling

          // Comprehensive cleanup
          if (progressPollingIntervalRef.current) {
            clearInterval(progressPollingIntervalRef.current);
            progressPollingIntervalRef.current = null;
          }
          if (progressPollingAbortControllerRef.current) {
            progressPollingAbortControllerRef.current.abort();
            progressPollingAbortControllerRef.current = null;
          }
          handleError('Import session not found or expired', 'Progress Polling');
          return;
        }
      }
    };

    // Start immediate poll and then every 2 seconds
    pollProgress();
    const interval = setInterval(pollProgress, 2000);
    progressPollingIntervalRef.current = interval;
  }, [handleError, showSuccessMessage]);

  // Stop progress polling
  const stopProgressPolling = useCallback(() => {
    // Comprehensive cleanup to prevent memory leaks
    if (progressPollingIntervalRef.current) {
      clearInterval(progressPollingIntervalRef.current);
      progressPollingIntervalRef.current = null;
    }
    if (progressPollingAbortControllerRef.current) {
      progressPollingAbortControllerRef.current.abort();
      progressPollingAbortControllerRef.current = null;
    }
  }, []);

  // Update import result from progress data
  const createImportResultFromProgress = useCallback((
    progressData: any,
    existingResult?: ImportStats | null
  ): ImportStats => {
    if (existingResult && existingResult.duplicateHandlingStrategy) {
      // Keep existing duplicate handling data, just update final counts

      return {
        ...existingResult,
        totalProcessed: progressData.processedRecords || existingResult.totalProcessed,
        successful: progressData.successfulRecords || existingResult.successful,
        errors: progressData.failedRecords || existingResult.errors
      };
    } else {
      // No existing data, use progress data
      return {
        totalProcessed: progressData.processedRecords,
        successful: progressData.successfulRecords,
        duplicates: progressData.duplicatesHandled || 0,
        errors: progressData.failedRecords,
        importSessionId: progressData.importSessionId
      };
    }
  }, []);

  // Reset progress state
  const resetProgress = useCallback(() => {
    stopProgressPolling();
    setImportProgress(null);
  }, [stopProgressPolling]);

  // Comprehensive cleanup on unmount
  useEffect(() => {
    return () => {
      // Comprehensive cleanup to prevent memory leaks
      if (progressPollingIntervalRef.current) {
        clearInterval(progressPollingIntervalRef.current);
        progressPollingIntervalRef.current = null;
      }
      if (progressPollingAbortControllerRef.current) {
        progressPollingAbortControllerRef.current.abort();
        progressPollingAbortControllerRef.current = null;
      }
    };
  }, []);

  return {
    importProgress,
    startProgressPolling,
    stopProgressPolling,
    createImportResultFromProgress,
    resetProgress,
    setImportProgress
  };
};

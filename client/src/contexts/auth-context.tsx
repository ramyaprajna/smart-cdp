import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for race condition prevention and request cancellation
  const authAbortControllerRef = useRef<AbortController | null>(null);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const logoutAbortControllerRef = useRef<AbortController | null>(null);
  const lastAuthCheckRef = useRef<number>(0);

  // Debounced auth check to prevent rapid consecutive calls
  const checkAuthStatus = useCallback(async () => {
    const now = Date.now();
    const debounceDelay = 500; // 500ms debounce

    // Debounce rapid consecutive calls
    if (now - lastAuthCheckRef.current < debounceDelay) {
      return;
    }
    lastAuthCheckRef.current = now;

    // Cancel any existing auth check
    if (authAbortControllerRef.current) {
      authAbortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    authAbortControllerRef.current = abortController;

    try {

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const response = await fetch('/api/auth/me', {
        headers,
        credentials: 'include',
        signal: abortController.signal
      });

      // Only update state if this request is still current
      if (authAbortControllerRef.current === abortController) {
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Clear user state on 401/non-OK to sync frontend with backend
          setUser(null);
        }
      }
    } catch (error) {
      // Only handle non-abort errors and only if request is still current
      if (error instanceof Error && error.name !== 'AbortError' &&
          authAbortControllerRef.current === abortController) {
        console.error('Auth check failed:', error);
        // Clear user state on error to be safe
        setUser(null);
      }
    } finally {
      // Only update loading state and clear ref if this request is still current
      if (authAbortControllerRef.current === abortController) {
        setIsLoading(false);
        authAbortControllerRef.current = null;
      }
    }
  }, []);

  // Check if user is authenticated on app load
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Comprehensive cleanup on unmount to prevent race conditions
  useEffect(() => {
    return () => {
      // Abort all pending requests to prevent race conditions
      if (authAbortControllerRef.current) {
        authAbortControllerRef.current.abort();
        authAbortControllerRef.current = null;
      }
      if (loginAbortControllerRef.current) {
        loginAbortControllerRef.current.abort();
        loginAbortControllerRef.current = null;
      }
      if (logoutAbortControllerRef.current) {
        logoutAbortControllerRef.current.abort();
        logoutAbortControllerRef.current = null;
      }
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);

    // Cancel any existing login request
    if (loginAbortControllerRef.current) {
      loginAbortControllerRef.current.abort();
    }

    // Create new abort controller for this login request
    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: abortController.signal
      });

      // Only process response if this request is still current
      if (loginAbortControllerRef.current === abortController) {
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();
        setUser(data.user);

        // Store token in localStorage for authorization header
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    } catch (error) {
      // Only handle non-abort errors and only if request is still current
      if (error instanceof Error && error.name !== 'AbortError' &&
          loginAbortControllerRef.current === abortController) {
        throw error;
      }
      // Silent return on cancellation - no error throwing
    } finally {
      // Only update loading state and clear ref if this request is still current
      if (loginAbortControllerRef.current === abortController) {
        setIsLoading(false);
        loginAbortControllerRef.current = null;
      }
    }
  }, []);

  const logout = useCallback(async () => {
    // Cancel any existing logout request
    if (logoutAbortControllerRef.current) {
      logoutAbortControllerRef.current.abort();
    }

    // Create new abort controller for this logout request
    const abortController = new AbortController();
    logoutAbortControllerRef.current = abortController;

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        signal: abortController.signal
      });

      // Only clear state if this request is still current
      if (logoutAbortControllerRef.current === abortController) {
        setUser(null);
        localStorage.removeItem('token');
      }
    } catch (error) {
      // Only handle non-abort errors and only if request is still current
      if (error instanceof Error && error.name !== 'AbortError' &&
          logoutAbortControllerRef.current === abortController) {
        console.error('Logout failed:', error);
        // Still clear local state even if server request fails
        setUser(null);
        localStorage.removeItem('token');
      }
      // Silent return on cancellation
    } finally {
      // Only clear ref if this request is still current
      if (logoutAbortControllerRef.current === abortController) {
        logoutAbortControllerRef.current = null;
      }
    }
  }, []);

  // Optimize context value with useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
  }), [user, login, logout, isLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

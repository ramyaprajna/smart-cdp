/**
 * Frontend Component Utilities - Common Patterns for React Components
 *
 * Centralized utilities for common frontend patterns including:
 * - State management helpers
 * - Event handler optimizations
 * - Data formatting utilities
 * - Loading state management
 * - Error boundary patterns
 *
 * Created: August 13, 2025
 * Purpose: Standardize frontend patterns and reduce component duplication
 */

import { useCallback, useMemo, useState } from 'react';

export interface LoadingState {
  isLoading: boolean;
  error?: string;
  data?: any;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface FilterState {
  [key: string]: any;
}

/**
 * Loading state management hook
 */
export function useLoadingState<T>(initialData?: T) {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: undefined,
    data: initialData
  });

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading, error: undefined }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, isLoading: false, error }));
  }, []);

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, isLoading: false, error: undefined, data }));
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: undefined, data: initialData });
  }, [initialData]);

  return {
    ...state,
    setLoading,
    setError,
    setData,
    reset
  };
}

/**
 * Pagination management hook
 */
export function usePagination(initialPageSize: number = 10) {
  const [state, setState] = useState<PaginationState>({
    page: 1,
    pageSize: initialPageSize,
    total: 0
  });

  const setPage = useCallback((page: number) => {
    setState(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const setTotal = useCallback((total: number) => {
    setState(prev => ({ ...prev, total }));
  }, []);

  const nextPage = useCallback(() => {
    setState(prev => ({
      ...prev,
      page: Math.min(prev.page + 1, Math.ceil(prev.total / prev.pageSize))
    }));
  }, []);

  const prevPage = useCallback(() => {
    setState(prev => ({ ...prev, page: Math.max(prev.page - 1, 1) }));
  }, []);

  const totalPages = useMemo(() =>
    Math.ceil(state.total / state.pageSize),
    [state.total, state.pageSize]
  );

  const hasNextPage = useMemo(() =>
    state.page < totalPages,
    [state.page, totalPages]
  );

  const hasPrevPage = useMemo(() =>
    state.page > 1,
    [state.page]
  );

  return {
    ...state,
    totalPages,
    hasNextPage,
    hasPrevPage,
    setPage,
    setPageSize,
    setTotal,
    nextPage,
    prevPage
  };
}

/**
 * Filter management hook
 */
export function useFilters<T extends FilterState>(initialFilters: T) {
  const [filters, setFilters] = useState<T>(initialFilters);

  const updateFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const removeFilter = useCallback(<K extends keyof T>(key: K) => {
    setFilters(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest as T;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const hasActiveFilters = useMemo(() =>
    Object.values(filters).some(value =>
      value !== null && value !== undefined && value !== ''
    ),
    [filters]
  );

  const activeFilterCount = useMemo(() =>
    Object.values(filters).filter(value =>
      value !== null && value !== undefined && value !== ''
    ).length,
    [filters]
  );

  return {
    filters,
    updateFilter,
    removeFilter,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
    setFilters
  };
}

/**
 * Debounced state hook
 */
export function useDebouncedState<T>(initialValue: T, delay: number = 300) {
  const [value, setValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);

  const updateValue = useCallback((newValue: T) => {
    setValue(newValue);

    const timeout = setTimeout(() => {
      setDebouncedValue(newValue);
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay]);

  return {
    value,
    debouncedValue,
    setValue: updateValue,
    setImmediate: setValue
  };
}

/**
 * Data formatting utilities
 */
export class DataFormatter {
  static formatNumber(value: number | undefined | null, decimals: number = 2): string {
    if (value == null || isNaN(value)) return '—';
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  static formatCurrency(value: number | undefined | null, currency: string = 'USD'): string {
    if (value == null || isNaN(value)) return '—';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency
    }).format(value);
  }

  static formatPercentage(value: number | undefined | null, decimals: number = 1): string {
    if (value == null || isNaN(value)) return '—';
    return `${value.toFixed(decimals)}%`;
  }

  static formatDate(value: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions): string {
    if (!value) return '—';

    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '—';

    return date.toLocaleDateString(undefined, options || {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  static formatRelativeTime(value: string | Date | undefined | null): string {
    if (!value) return '—';

    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  static truncateText(text: string | undefined | null, maxLength: number = 50): string {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  }
}

/**
 * Common event handlers
 */
export class EventHandlers {
  static createSearchHandler(
    onSearch: (query: string) => void,
    delay: number = 300
  ) {
    let timeout: NodeJS.Timeout;

    return (query: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => onSearch(query), delay);
    };
  }

  static createConfirmHandler(
    onConfirm: () => void,
    message: string = 'Are you sure?'
  ) {
    return () => {
      if (window.confirm(message)) {
        onConfirm();
      }
    };
  }

  static createFileUploadHandler(
    onUpload: (files: FileList) => void,
    acceptedTypes?: string[]
  ) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      if (acceptedTypes) {
        const validFiles = Array.from(files).filter(file =>
          acceptedTypes.some(type => file.type.includes(type))
        );
        if (validFiles.length === 0) {
          alert('Please select a valid file type');
          return;
        }
      }

      onUpload(files);
    };
  }
}

/**
 * Performance optimization utilities
 */
export class PerformanceUtils {
  static createStableCallback<T extends (...args: any[]) => any>(
    callback: T,
    dependencies: React.DependencyList
  ): T {
    return useCallback(callback, dependencies);
  }

  static createStableValue<T>(
    factory: () => T,
    dependencies: React.DependencyList
  ): T {
    return useMemo(factory, dependencies);
  }
}

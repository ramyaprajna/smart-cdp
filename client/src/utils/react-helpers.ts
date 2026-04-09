/**
 * Utility functions for React components
 * Common formatting, validation, and helper functions
 */

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';

// Date formatting utilities
export const formatDate = (date: Date | string | null, options?: { style?: 'short' | 'long' | 'relative' }) => {
  if (!date) return 'N/A';

  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    if (options?.style === 'relative') {
      const now = new Date();
      const diffMs = now.getTime() - dateObj.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
      return `${Math.floor(diffDays / 365)} years ago`;
    }

    if (options?.style === 'long') {
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    return dateObj.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
};

// Currency formatting
export const formatCurrency = (amount: number | null, currency = 'USD') => {
  if (amount === null || amount === undefined) return 'N/A';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
};

// Number formatting
export const formatNumber = (num: number | null, options?: { decimals?: number; suffix?: string }) => {
  if (num === null || num === undefined) return 'N/A';

  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: options?.decimals || 0,
    maximumFractionDigits: options?.decimals || 0
  });

  return options?.suffix ? `${formatted}${options.suffix}` : formatted;
};

// Percentage formatting
export const formatPercentage = (value: number | null, decimals = 1) => {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(decimals)}%`;
};

// File size formatting
export const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Text truncation
export const truncateText = (text: string | null, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

// Validation helpers
export const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

// Custom hooks for performance
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const usePrevious = <T>(value: T): T | undefined => {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
};

// Component optimization helpers
export const withMemo = <P extends object>(
  Component: React.ComponentType<P>,
  areEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  return React.memo(Component, areEqual);
};

// Error boundary helper
export const createErrorHandler = (componentName: string) => {
  return (error: Error, errorInfo: React.ErrorInfo) => {
    console.error(`Error in ${componentName}:`, error, errorInfo);
  };
};

// Event handler optimization
export const createEventHandler = <T extends (...args: any[]) => any>(
  handler: T,
  deps: React.DependencyList
): T => {
  return useCallback(handler, deps);
};

// Form validation helpers
export const createFieldValidator = (rules: Array<(value: any) => string | null>) => {
  return (value: any): string[] => {
    return rules
      .map(rule => rule(value))
      .filter((error): error is string => error !== null);
  };
};

export const required = (message = 'This field is required') => (value: any) => {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return message;
  }
  return null;
};

export const minLength = (min: number, message?: string) => (value: string) => {
  if (value && value.length < min) {
    return message || `Must be at least ${min} characters`;
  }
  return null;
};

export const email = (message = 'Invalid email address') => (value: string) => {
  if (value && !isValidEmail(value)) {
    return message;
  }
  return null;
};

export default {
  formatDate,
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatFileSize,
  truncateText,
  isValidEmail,
  isValidPhone,
  useDebounce,
  usePrevious,
  useLocalStorage,
  withMemo,
  createErrorHandler,
  createEventHandler,
  createFieldValidator,
  required,
  minLength,
  email
};

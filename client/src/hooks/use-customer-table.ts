/**
 * Custom hook for customer table functionality
 * Manages table state, filtering, actions, and data formatting
 */

import { useCallback, useMemo } from 'react';
import { Customer } from '@shared/schema';
// Utility functions for formatting data

interface CustomerTableHookResult {
  // Data formatters
  getSegmentColor: (segment: string | null) => string;
  getInitials: (firstName: string | null, lastName: string | null) => string;
  formatLifetimeValue: (value: number | null) => string;
  formatLastActive: (date: Date | string | null) => string;
  formatAddress: (address: any) => string;

  // Table helpers
  getActiveFilterCount: (filters: any) => number;

  // Actions
  exportCustomers: () => void;
}

const SEGMENT_COLORS = {
  "Professional": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Student": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Entrepreneur": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Regular Listener": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "High Value": "bg-primary/10 text-primary",
  "Frequent Buyer": "bg-secondary/10 text-secondary",
  "New Customer": "bg-muted text-muted-foreground",
  "At Risk": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
} as const;

export function useCustomerTable(): CustomerTableHookResult {
  const getSegmentColor = useCallback((segment: string | null) => {
    if (!segment) return "bg-muted text-muted-foreground";
    return SEGMENT_COLORS[segment as keyof typeof SEGMENT_COLORS] || "bg-muted text-muted-foreground";
  }, []);

  const getInitials = useCallback((firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return `${first}${last}`.toUpperCase() || "??";
  }, []);

  const formatLifetimeValue = useCallback((value: number | null) => {
    if (!value) return "N/A";
    return `$${Number(value).toLocaleString()}`;
  }, []);

  const formatLastActive = useCallback((date: Date | string | null) => {
    if (!date) return "Never";
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return "Invalid Date";
    }
  }, []);

  const formatAddress = useCallback((address: any) => {
    if (!address) return "N/A";

    // Handle JSON string
    if (typeof address === 'string') {
      try {
        address = JSON.parse(address);
      } catch {
        return address;
      }
    }

    // Handle object with city/province
    if (typeof address === 'object') {
      const parts = [];
      if (address.city) parts.push(address.city);
      if (address.province) parts.push(address.province);
      if (address.country) parts.push(address.country);
      return parts.join(', ') || "N/A";
    }

    return "N/A";
  }, []);

  const getActiveFilterCount = useCallback((filters: any) => {
    if (!filters) return 0;
    return Object.values(filters).filter(
      value => value !== undefined && value !== null && value !== "" &&
               !(Array.isArray(value) && value.length === 0)
    ).length;
  }, []);

  const exportCustomers = useCallback(() => {
    // Implementation for CSV export

    // This would typically trigger a download
  }, []);

  return {
    // Data formatters
    getSegmentColor,
    getInitials,
    formatLifetimeValue,
    formatLastActive,
    formatAddress,

    // Table helpers
    getActiveFilterCount,

    // Actions
    exportCustomers
  };
}

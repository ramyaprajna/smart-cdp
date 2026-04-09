/**
 * Custom hook for customer filter state management
 * Implements staging pattern to prevent automatic API calls on every input change
 *
 * @param initialFilters - Current active filters from parent component
 * @param onFiltersChange - Callback to apply filters (triggers API call)
 * @param onClearFilters - Callback to clear all filters
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { cleanFilters } from "@/components/customers/filter-utils";

interface UseCustomerFiltersProps {
  initialFilters: CustomerFilters;
  onFiltersChange: (filters: CustomerFilters) => void;
  onClearFilters: () => void;
}

interface UseCustomerFiltersReturn {
  localFilters: CustomerFilters;
  updateFilter: (key: keyof CustomerFilters, value: any) => void;
  updateMultipleFilters: (updates: Partial<CustomerFilters>) => void;
  removeFilter: (key: keyof CustomerFilters) => void;
  applyFilters: () => void;
  clearAllFilters: () => void;
  resetToInitial: () => void;
  hasUnappliedChanges: boolean;
}

/**
 * Hook that manages local filter state with staging pattern
 * All changes are held locally until explicitly applied
 */
export function useCustomerFilters({
  initialFilters,
  onFiltersChange,
  onClearFilters
}: UseCustomerFiltersProps): UseCustomerFiltersReturn {
  // Local staging state - prevents automatic API calls on every input change
  const [localFilters, setLocalFilters] = useState<CustomerFilters>(initialFilters);

  // Use refs to stable callback references and prevent unnecessary re-renders
  const onFiltersChangeRef = useRef(onFiltersChange);
  const onClearFiltersRef = useRef(onClearFilters);

  // Keep refs up to date
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  useEffect(() => {
    onClearFiltersRef.current = onClearFilters;
  }, [onClearFilters]);

  // Sync local filters with parent state when filters are applied externally
  // This ensures the dialog shows current active filters when reopened
  useEffect(() => {
    setLocalFilters(initialFilters);
  }, [initialFilters]);

  /**
   * Update a single filter in local state only - no API calls until apply
   */
  const updateFilter = useCallback((key: keyof CustomerFilters, value: any) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  /**
   * Update multiple filters at once - useful for related filter changes
   */
  const updateMultipleFilters = useCallback((updates: Partial<CustomerFilters>) => {
    setLocalFilters(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  /**
   * Remove a filter from local state - staging pattern for user experience
   */
  const removeFilter = useCallback((key: keyof CustomerFilters) => {
    setLocalFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  /**
   * Apply all staged filters at once - triggers API call
   * Uses ref to prevent recreating on every localFilters change
   */
  const applyFilters = useCallback(() => {
    const cleanedFilters = cleanFilters(localFilters);
    onFiltersChangeRef.current(cleanedFilters);
  }, [localFilters]);

  /**
   * Clear all filters both locally and on server - immediate API call
   * Uses ref to prevent unnecessary re-renders
   */
  const clearAllFilters = useCallback(() => {
    setLocalFilters({});
    onClearFiltersRef.current();
  }, []);

  /**
   * Reset local filters to initial state without applying
   */
  const resetToInitial = useCallback(() => {
    setLocalFilters(initialFilters);
  }, [initialFilters]);

  /**
   * Check if there are unapplied changes in local state (memoized to prevent expensive re-computation)
   */
  const hasUnappliedChanges = useMemo(() => {
    return JSON.stringify(cleanFilters(localFilters)) !== JSON.stringify(cleanFilters(initialFilters));
  }, [localFilters, initialFilters]);

  return {
    localFilters,
    updateFilter,
    updateMultipleFilters,
    removeFilter,
    applyFilters,
    clearAllFilters,
    resetToInitial,
    hasUnappliedChanges
  };
}

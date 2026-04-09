import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImportRecord, ImportFilters } from '../types/import';
import { buildQueryParams, filterImports, calculateSummaryStats } from '../utils/import-helpers';
import { QUERY_CONFIG, DEFAULT_FILTERS } from '../constants/import';

/**
 * Custom hook for managing import history data and filters
 *
 * This hook encapsulates all data management logic for the import history page,
 * providing a clean API for components to interact with import data, filters,
 * and loading states. It follows the separation of concerns principle by
 * keeping business logic separate from UI components.
 *
 * Features:
 * - Centralized state management for filters
 * - React Query integration for data fetching and caching
 * - Computed values for filtered data and summary statistics
 * - Optimized performance with memoization
 * - Real-time updates with configurable refresh intervals
 *
 * Usage:
 * ```tsx
 * const {
 *   imports,           // Filtered import records
 *   summaryStats,      // Calculated statistics
 *   isLoading,         // Loading state
 *   error,             // Error state
 *   filters,           // Current filter values
 *   setSearchTerm,     // Filter setters
 *   refetch            // Manual refresh
 * } = useImportHistory();
 * ```
 *
 * @returns {Object} Import history data and management functions
 */
export const useImportHistory = () => {
  // Filter state
  const [filters, setFilters] = useState<ImportFilters>(DEFAULT_FILTERS);

  // Individual filter setters for easier component integration
  const setSearchTerm = (search: string) => setFilters(prev => ({ ...prev, search }));
  const setStatusFilter = (status: string) => setFilters(prev => ({ ...prev, status }));
  const setTypeFilter = (type: string) => setFilters(prev => ({ ...prev, type }));
  const setDateRange = (dateRange: string) => setFilters(prev => ({ ...prev, dateRange }));

  // API query
  const {
    data: imports = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/data-lineage', filters],
    queryFn: async (): Promise<ImportRecord[]> => {
      const params = buildQueryParams(filters);
      const response = await fetch(`/api/data-lineage?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch import history');
      }

      const data = await response.json();

      // Check if the response is an error object
      if (data.error) {
        throw new Error(data.error);
      }

      // Ensure we return an array - either data.imports or data itself if it's an array
      if (Array.isArray(data)) {
        return data;
      }

      if (data.imports && Array.isArray(data.imports)) {
        return data.imports;
      }

      // If we get here, the response format is unexpected
      console.error('Unexpected response format:', data);
      return [];
    },
    refetchInterval: QUERY_CONFIG.REFETCH_INTERVAL,
    staleTime: QUERY_CONFIG.STALE_TIME,
  });

  // Computed values
  const filteredImports = useMemo(() =>
    filterImports(imports, filters),
    [imports, filters]
  );

  const summaryStats = useMemo(() =>
    calculateSummaryStats(filteredImports),
    [filteredImports]
  );

  return {
    // Data
    imports: filteredImports,
    summaryStats,

    // Loading states
    isLoading,
    error,

    // Filters
    filters,
    setSearchTerm,
    setStatusFilter,
    setTypeFilter,
    setDateRange,

    // Actions
    refetch,
  };
};

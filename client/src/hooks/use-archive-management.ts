/**
 * useArchiveManagement Hook
 *
 * React hook for comprehensive archive management functionality.
 * Handles CRUD operations, restoration, and archive statistics.
 *
 * Features:
 * - Archive creation with customizable options
 * - Archive listing with search and pagination
 * - Archive editing and metadata updates
 * - Data restoration with selective options
 * - Statistics and monitoring
 * - Secure admin-only operations
 *
 * Last Updated: August 1, 2025
 * Integration Status: ✅ NEW - Administrator toolset enhancement
 */

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useArchiveLogging } from './use-archive-logging';

export interface Archive {
  id: string;
  name: string;
  description?: string;
  archiveType: 'full' | 'partial' | 'backup';
  status: 'creating' | 'completed' | 'failed' | 'restored';
  dataSize: number;
  recordCounts: Record<string, number>;
  metadata: any;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  restoredAt?: string;
  restoredBy?: string;
}

export interface ArchiveData {
  tableName: string;
  recordCount: number;
  dataSize: number;
  createdAt: string;
}

export interface ArchiveStatistics {
  totalArchives: number;
  totalDataSize: number;
  averageArchiveSize: number;
  oldestArchive?: string;
  newestArchive?: string;
  totalRecordsArchived: number;
}

export interface CreateArchiveOptions {
  name: string;
  description?: string;
  archiveType?: 'full' | 'partial' | 'backup';
  includeCustomers?: boolean;
  includeTables?: string[];
  excludeTables?: string[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

export interface RestoreOptions {
  restoreType: 'full' | 'selective';
  selectedTables?: string[];
  replaceExisting: boolean;
  validateData: boolean;
}

export function useArchiveManagement() {
  const queryClient = useQueryClient();
  const { logArchiveAction, logArchiveError, logArchivePerformance, withArchiveLogging } = useArchiveLogging();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'data_size'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Get archives with pagination and filtering
  const {
    data: archivesData,
    isLoading: isLoadingArchives,
    error: archivesError,
    refetch: refetchArchives
  } = useQuery({
    queryKey: ['/api/archives', {
      offset: currentPage * pageSize,
      limit: pageSize,
      search: searchQuery,
      sortBy,
      sortOrder
    }],
    enabled: true,
    staleTime: 30000, // 30 seconds
  });

  // Get archive statistics
  const {
    data: statisticsData,
    isLoading: isLoadingStats,
    refetch: refetchStats
  } = useQuery<ArchiveStatistics>({
    queryKey: ['/api/archives/statistics'],
    staleTime: 60000, // 1 minute
  });

  // Enhanced refetch with logging
  const refreshStatistics = useCallback(async () => {
    const startTime = performance.now();
    await logArchiveAction('refresh', {
      operation: 'statistics_refresh',
      componentContext: 'archive_statistics'
    });

    try {
      const result = await refetchStats();
      await logArchivePerformance('statistics_refresh', startTime, {
        recordsProcessed: result.data?.totalArchives || 0
      });
      return result;
    } catch (error) {
      await logArchiveError('statistics_refresh', error as Error, {
        operation: 'statistics_refresh'
      });
      throw error;
    }
  }, [refetchStats, logArchiveAction, logArchivePerformance, logArchiveError]);

  // Create archive mutation
  const createArchiveMutation = useMutation<Response, Error, CreateArchiveOptions>({
    mutationFn: withArchiveLogging('create', async (options: CreateArchiveOptions) => {
      await logArchiveAction('create', {
        archiveName: options.name,
        archiveType: options.includeCustomers ? 'full' : 'partial',
        componentContext: 'create_archive_mutation'
      });
      const result = await apiRequest('POST', '/api/archives', options);
      return result;
    }, { operation: 'create_archive' }),
    onSuccess: (result) => {
      const data = result as any;
      logArchiveAction('create', {
        archiveId: data?.id,
        archiveName: data?.name,
        operation: 'create_success'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/archives'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archives/statistics'] });
    },
    onError: (error: Error, variables) => {
      logArchiveError('create_archive', error, {
        archiveName: variables.name,
        operation: 'create_archive_mutation'
      });
    }
  });

  // Update archive mutation
  const updateArchiveMutation = useMutation({
    mutationFn: async ({
      archiveId,
      updates
    }: {
      archiveId: string;
      updates: Partial<Pick<Archive, 'name' | 'description' | 'metadata'>>
    }) => {
      return await apiRequest('PUT', `/api/archives/${archiveId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/archives'] });
    }
  });

  // Delete archive mutation
  const deleteArchiveMutation = useMutation<Response, Error, string>({
    mutationFn: withArchiveLogging('delete', async (archiveId: string) => {
      await logArchiveAction('delete', {
        archiveId,
        componentContext: 'delete_archive_mutation'
      });
      return await apiRequest('DELETE', `/api/archives/${archiveId}`);
    }, { operation: 'delete_archive' }),
    onSuccess: (result, archiveId) => {
      logArchiveAction('delete', {
        archiveId,
        operation: 'delete_success'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/archives'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archives/statistics'] });
    },
    onError: (error: Error, archiveId) => {
      logArchiveError('delete_archive', error, {
        archiveId,
        operation: 'delete_archive_mutation'
      });
    }
  });

  // Restore archive mutation
  const restoreArchiveMutation = useMutation<Response, Error, { archiveId: string; options: RestoreOptions }>({
    mutationFn: withArchiveLogging('restore', async ({
      archiveId,
      options
    }: {
      archiveId: string;
      options: RestoreOptions
    }) => {
      await logArchiveAction('restore', {
        archiveId,
        componentContext: 'restore_archive_mutation',
        beforeState: { options }
      });
      return await apiRequest('POST', `/api/archives/${archiveId}/restore`, options);
    }, { operation: 'restore_archive' }),
    onSuccess: (result, { archiveId, options }) => {
      logArchiveAction('restore', {
        archiveId,
        operation: 'restore_success',
        afterState: { restored: true, options }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/archives'] });
      // Also invalidate other data that might have been restored
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    },
    onError: (error: Error, { archiveId, options }) => {
      logArchiveError('restore_archive', error, {
        archiveId,
        operation: 'restore_archive_mutation',
        errorDetails: { options }
      });
    }
  });

  // Clean data mutation
  const cleanDataMutation = useMutation<Response, Error, string[] | undefined>({
    mutationFn: withArchiveLogging('clean', async (tablesToClean?: string[]) => {
      await logArchiveAction('clean', {
        componentContext: 'clean_data_mutation',
        beforeState: { tablesToClean },
        operation: 'data_cleaning'
      });
      return await apiRequest('POST', '/api/archives/clean', { tablesToClean });
    }, { operation: 'clean_data' }),
    onSuccess: (result, tablesToClean) => {
      const data = result as any;
      logArchiveAction('clean', {
        operation: 'clean_success',
        afterState: { cleaned: true, tablesToClean },
        recordCount: data?.deletedRecords || 0
      });
      // Invalidate all data since we cleaned it AND refresh archives
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/segments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archives'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archives/statistics'] });
    },
    onError: (error: Error, tablesToClean) => {
      logArchiveError('clean_data', error, {
        operation: 'clean_data_mutation',
        errorDetails: { tablesToClean }
      });
    }
  });

  // Get specific archive details
  const getArchiveDetails = useCallback(async (archiveId: string) => {
    return await apiRequest('GET', `/api/archives/${archiveId}`);
  }, []);

  /**
   * Create a new archive
   */
  const createArchive = useCallback(async (options: CreateArchiveOptions) => {
    return await createArchiveMutation.mutateAsync(options);
  }, [createArchiveMutation]);

  /**
   * Update archive metadata
   */
  const updateArchive = useCallback(async (
    archiveId: string,
    updates: Partial<Pick<Archive, 'name' | 'description' | 'metadata'>>
  ) => {
    return await updateArchiveMutation.mutateAsync({ archiveId, updates });
  }, [updateArchiveMutation]);

  /**
   * Delete an archive
   */
  const deleteArchive = useCallback(async (archiveId: string) => {
    return await deleteArchiveMutation.mutateAsync(archiveId);
  }, [deleteArchiveMutation]);

  /**
   * Restore archive data
   */
  const restoreArchive = useCallback(async (archiveId: string, options: RestoreOptions) => {
    return await restoreArchiveMutation.mutateAsync({ archiveId, options });
  }, [restoreArchiveMutation]);

  /**
   * Clean application data
   */
  const cleanApplicationData = useCallback(async (tablesToClean?: string[]) => {
    return await cleanDataMutation.mutateAsync(tablesToClean);
  }, [cleanDataMutation]);

  /**
   * Search and filter functions
   */
  const updateSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(0); // Reset to first page
  }, []);

  const updateSorting = useCallback((
    newSortBy: 'name' | 'created_at' | 'data_size',
    newSortOrder: 'asc' | 'desc'
  ) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setCurrentPage(0); // Reset to first page
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(0); // Reset to first page
  }, []);

  /**
   * Utility functions
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getArchiveStatusColor = useCallback((status: Archive['status']): string => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'creating': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      case 'restored': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  }, []);

  const getArchiveTypeLabel = useCallback((type: Archive['archiveType']): string => {
    switch (type) {
      case 'full': return 'Full Archive';
      case 'partial': return 'Partial Archive';
      case 'backup': return 'Backup Archive';
      default: return 'Unknown';
    }
  }, []);

  return {
    // Data
    archives: (archivesData as any)?.archives || [],
    totalArchives: (archivesData as any)?.pagination?.total || 0,
    statistics: (statisticsData as any)?.statistics,

    // Loading states
    isLoadingArchives,
    isLoadingStats,
    isCreating: createArchiveMutation.isPending,
    isUpdating: updateArchiveMutation.isPending,
    isDeleting: deleteArchiveMutation.isPending,
    isRestoring: restoreArchiveMutation.isPending,
    isCleaning: cleanDataMutation.isPending,

    // Error states
    archivesError,
    createError: createArchiveMutation.error,
    updateError: updateArchiveMutation.error,
    deleteError: deleteArchiveMutation.error,
    restoreError: restoreArchiveMutation.error,
    cleanError: cleanDataMutation.error,

    // Actions
    createArchive,
    updateArchive,
    deleteArchive,
    restoreArchive,
    cleanApplicationData,
    getArchiveDetails,
    refetchArchives,
    refetchStats,
    refreshStatistics,

    // Pagination and filtering
    currentPage,
    pageSize,
    searchQuery,
    sortBy,
    sortOrder,
    updateSearch,
    updateSorting,
    goToPage,
    changePageSize,

    // Utilities
    formatFileSize,
    getArchiveStatusColor,
    getArchiveTypeLabel,

    // Computed values
    hasNextPage: (archivesData as any)?.pagination?.hasMore || false,
    totalPages: Math.ceil(((archivesData as any)?.pagination?.total || 0) / pageSize),
  };
}

export type UseArchiveManagementReturn = ReturnType<typeof useArchiveManagement>;

/**
 * Custom hook for import error management
 * Provides functionality to retrieve and manage failed import records
 *
 * Features:
 * - Fetch failed records for import sessions
 * - Get specific failed record details
 * - Error summary and pattern analysis
 * - Mark errors as resolved or for retry
 * - Real-time error tracking
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY for CDP error tracking
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { ImportErrorSummary, ImportSession, ImportErrorDetail } from '@/types/import';

interface UseImportErrorsOptions {
  importSessionId?: string;
  errorType?: string;
  limit?: number;
  offset?: number;
  includeRetried?: boolean;
}

interface UseImportErrorsResult {
  // Data
  failedRecords: ImportErrorDetail[];
  errorSummary: ImportErrorSummary | null;
  importSession: ImportSession | null;

  // State
  isLoading: boolean;
  isLoadingSummary: boolean;
  isLoadingSession: boolean;
  error: string | null;

  // Actions
  getFailedRecord: (rowNumber: number, fileName?: string) => Promise<ImportErrorDetail | null>;
  markAsResolved: (rowNumber: number, fileName: string) => Promise<void>;
  markForRetry: (rowNumber: number, fileName: string) => Promise<void>;
  refreshErrors: () => void;

  // Utils
  getErrorTypeColor: (errorType: string) => string;
  getErrorSeverity: (errorDetail: ImportErrorDetail) => 'low' | 'medium' | 'high' | 'critical';
}

export function useImportErrors(options: UseImportErrorsOptions = {}): UseImportErrorsResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Fetch failed records
  const {
    data: failedRecordsData,
    isLoading,
    refetch: refreshErrors
  } = useQuery({
    queryKey: ['/api/imports', options.importSessionId, 'errors', options],
    queryFn: async () => {
      if (!options.importSessionId) return [];

      const params = new URLSearchParams();
      if (options.errorType) params.append('errorType', options.errorType);
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
      if (options.includeRetried) params.append('includeRetried', 'true');

      const response = await fetch(`/api/imports/${options.importSessionId}/errors?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch failed records: ${response.statusText}`);
      }

      const data = await response.json();
      return data.failedRecords || [];
    },
    enabled: !!options.importSessionId,
    staleTime: 30000, // 30 seconds
  });

  // Fetch error summary
  const {
    data: errorSummary,
    isLoading: isLoadingSummary
  } = useQuery({
    queryKey: ['/api/imports', options.importSessionId, 'error-summary'],
    queryFn: async () => {
      if (!options.importSessionId) return null;

      const response = await fetch(`/api/imports/${options.importSessionId}/error-summary`);
      if (!response.ok) {
        throw new Error(`Failed to fetch error summary: ${response.statusText}`);
      }

      const data = await response.json();
      return data.errorSummary || null;
    },
    enabled: !!options.importSessionId,
    staleTime: 60000, // 1 minute
  });

  // Fetch import session details
  const {
    data: importSession,
    isLoading: isLoadingSession
  } = useQuery({
    queryKey: ['/api/imports', options.importSessionId],
    queryFn: async () => {
      if (!options.importSessionId) return null;

      const response = await fetch(`/api/imports/${options.importSessionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch import session: ${response.statusText}`);
      }

      const data = await response.json();
      return data.importSession || null;
    },
    enabled: !!options.importSessionId,
    staleTime: 300000, // 5 minutes
  });

  // Get specific failed record by row number
  const getFailedRecord = useCallback(async (rowNumber: number, fileName?: string): Promise<ImportErrorDetail | null> => {
    if (!options.importSessionId) return null;

    try {
      const params = new URLSearchParams();
      if (fileName) params.append('fileName', fileName);

      const response = await fetch(
        `/api/imports/${options.importSessionId}/errors/row/${rowNumber}?${params}`
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch failed record: ${response.statusText}`);
      }

      const data = await response.json();
      return data.failedRecord || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast({
        title: "Error",
        description: `Failed to fetch record details: ${errorMessage}`,
        variant: "destructive"
      });
      return null;
    }
  }, [options.importSessionId, toast]);

  // Mark error as resolved mutation
  const markAsResolvedMutation = useMutation({
    mutationFn: async ({ rowNumber, fileName }: { rowNumber: number; fileName: string }) => {
      if (!options.importSessionId) throw new Error('No import session ID');

      const response = await fetch(
        `/api/imports/${options.importSessionId}/errors/row/${rowNumber}/resolve`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, resolution: 'resolved' })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to mark as resolved: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/imports', options.importSessionId] });
      toast({
        description: "Record marked as resolved successfully"
      });
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: "Resolution failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Mark for retry mutation
  const markForRetryMutation = useMutation({
    mutationFn: async ({ rowNumber, fileName }: { rowNumber: number; fileName: string }) => {
      if (!options.importSessionId) throw new Error('No import session ID');

      const response = await fetch(
        `/api/imports/${options.importSessionId}/errors/row/${rowNumber}/resolve`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, resolution: 'retried' })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to mark for retry: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/imports', options.importSessionId] });
      toast({
        description: "Record marked for retry successfully"
      });
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: "Retry marking failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Action wrappers
  const markAsResolved = useCallback(async (rowNumber: number, fileName: string) => {
    await markAsResolvedMutation.mutateAsync({ rowNumber, fileName });
  }, [markAsResolvedMutation]);

  const markForRetry = useCallback(async (rowNumber: number, fileName: string) => {
    await markForRetryMutation.mutateAsync({ rowNumber, fileName });
  }, [markForRetryMutation]);

  // Utility functions
  const getErrorTypeColor = useCallback((errorType: string): string => {
    const colorMap: Record<string, string> = {
      'INVALID_EMAIL': 'yellow',
      'INVALID_PHONE': 'yellow',
      'MISSING_REQUIRED_FIELD': 'red',
      'DUPLICATE_RECORD': 'blue',
      'INVALID_DATE_FORMAT': 'orange',
      'INVALID_NUMBER_FORMAT': 'orange',
      'FILE_PARSING_ERROR': 'purple',
      'MEMORY_LIMIT_EXCEEDED': 'red'
    };

    return colorMap[errorType] || 'gray';
  }, []);

  const getErrorSeverity = useCallback((errorDetail: ImportErrorDetail): 'low' | 'medium' | 'high' | 'critical' => {
    if (!errorDetail.canRetry) return 'critical';

    const criticalErrors = ['MISSING_REQUIRED_FIELD', 'MEMORY_LIMIT_EXCEEDED'];
    const highErrors = ['INVALID_EMAIL', 'DUPLICATE_RECORD'];
    const mediumErrors = ['INVALID_PHONE', 'INVALID_DATE_FORMAT'];

    if (criticalErrors.includes(errorDetail.errorType)) return 'critical';
    if (highErrors.includes(errorDetail.errorType)) return 'high';
    if (mediumErrors.includes(errorDetail.errorType)) return 'medium';

    return 'low';
  }, []);

  return {
    // Data
    failedRecords: failedRecordsData || [],
    errorSummary,
    importSession,

    // State
    isLoading,
    isLoadingSummary,
    isLoadingSession,
    error,

    // Actions
    getFailedRecord,
    markAsResolved,
    markForRetry,
    refreshErrors,

    // Utils
    getErrorTypeColor,
    getErrorSeverity
  };
}

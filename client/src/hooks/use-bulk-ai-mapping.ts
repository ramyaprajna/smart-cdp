/**
 * useBulkAIMapping Hook
 *
 * React hook for bulk AI mapping functionality.
 * Handles multiple file analysis and bulk processing operations.
 *
 * Features:
 * - Bulk file upload and analysis
 * - Real-time progress tracking
 * - Job status monitoring
 * - Results aggregation and summary
 * - Error handling and retry mechanisms
 *
 * Last Updated: July 23, 2025
 * Integration Status: ✅ NEW - Bulk AI processing enhancement
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

interface BulkAnalysisJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  filesCount: number;
  completedCount: number;
  startTime: string;
  endTime?: string;
  error?: string;
}

interface BulkMappingSummary {
  totalFiles: number;
  totalColumns: number;
  successfulMappings: number;
  failedAnalyses: number;
  averageConfidence: number;
  processingTime: number;
  recommendedMappings: Record<string, string>;
  conflictingMappings: Array<{
    columnName: string;
    suggestions: string[];
    confidence: number[];
  }>;
}

export function useBulkAIMapping() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // Start bulk analysis mutation
  const startBulkAnalysisMutation = useMutation({
    mutationFn: async ({ files, options = {} }: {
      files: FileList;
      options?: {
        maxSampleSize?: number;
        enableCaching?: boolean;
      };
    }) => {
      const formData = new FormData();

      // Add all files to form data
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      formData.append('maxSampleSize', (options.maxSampleSize || 100).toString());
      formData.append('enableCaching', (options.enableCaching !== false).toString());

      const response = await fetch('/api/ai-mapping/bulk-analyze', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Bulk analysis failed: ${response.statusText}`);
      }

      return await response.json();
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      setPollingEnabled(true);
    }
  });

  // Job status query with polling
  const { data: jobStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['/api/ai-mapping/bulk-status', currentJobId],
    queryFn: async () => {
      if (!currentJobId) return null;

      const response = await fetch(`/api/ai-mapping/bulk-status/${currentJobId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get job status');
      }

      const result = await response.json();
      return result.job as BulkAnalysisJob;
    },
    enabled: !!currentJobId && pollingEnabled,
    refetchInterval: (query) => {
      const data = query.state.data as BulkAnalysisJob | null | undefined;
      if (data?.status === 'completed' || data?.status === 'failed') {
        setPollingEnabled(false);
        return false;
      }
      return 2000; // Poll every 2 seconds
    }
  });

  // Results query
  const { data: bulkResults, isLoading: isLoadingResults } = useQuery({
    queryKey: ['/api/ai-mapping/bulk-results', currentJobId],
    queryFn: async () => {
      if (!currentJobId) return null;

      const response = await fetch(`/api/ai-mapping/bulk-results/${currentJobId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get bulk results');
      }

      const result = await response.json();
      return result.results as BulkMappingSummary;
    },
    enabled: jobStatus?.status === 'completed'
  });

  // Demo analysis mutation
  const demoAnalysisMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/ai-mapping/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Demo analysis failed: ${response.statusText}`);
      }

      return await response.json();
    }
  });

  /**
   * Start bulk analysis for multiple files
   */
  const startBulkAnalysis = useCallback(async (
    files: FileList,
    options?: {
      maxSampleSize?: number;
      enableCaching?: boolean;
    }
  ) => {
    return await startBulkAnalysisMutation.mutateAsync({ files, options });
  }, [startBulkAnalysisMutation]);

  /**
   * Run demo analysis
   */
  const runDemo = useCallback(async () => {
    return await demoAnalysisMutation.mutateAsync();
  }, [demoAnalysisMutation]);

  /**
   * Reset current job
   */
  const resetJob = useCallback(() => {
    setCurrentJobId(null);
    setPollingEnabled(false);
  }, []);

  /**
   * Get processing statistics
   */
  const getProcessingStats = useCallback(() => {
    if (!jobStatus) return null;

    const isActive = jobStatus.status === 'processing';
    const isCompleted = jobStatus.status === 'completed';
    const isFailed = jobStatus.status === 'failed';

    return {
      isActive,
      isCompleted,
      isFailed,
      progress: jobStatus.progress,
      filesProcessed: jobStatus.completedCount,
      totalFiles: jobStatus.filesCount,
      processingTime: jobStatus.endTime && jobStatus.startTime
        ? new Date(jobStatus.endTime).getTime() - new Date(jobStatus.startTime).getTime()
        : Date.now() - new Date(jobStatus.startTime).getTime()
    };
  }, [jobStatus]);

  /**
   * Format processing time for display
   */
  const formatProcessingTime = useCallback((milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }, []);

  /**
   * Get confidence level description
   */
  const getConfidenceLevel = useCallback((confidence: number): string => {
    if (confidence >= 90) return 'Excellent';
    if (confidence >= 75) return 'Good';
    if (confidence >= 60) return 'Fair';
    return 'Low';
  }, []);

  /**
   * Get recommended actions based on results
   */
  const getRecommendedActions = useCallback((results: BulkMappingSummary): string[] => {
    const actions: string[] = [];

    if (results.averageConfidence < 70) {
      actions.push('Review low-confidence mappings manually');
    }

    if (results.conflictingMappings.length > 0) {
      actions.push(`Resolve ${results.conflictingMappings.length} conflicting mappings`);
    }

    if (results.failedAnalyses > 0) {
      actions.push(`Retry analysis for ${results.failedAnalyses} failed files`);
    }

    if (results.successfulMappings / results.totalColumns > 0.8) {
      actions.push('Proceed with bulk import using AI mappings');
    }

    return actions;
  }, []);

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      setPollingEnabled(false);
    };
  }, []);

  return {
    // State
    currentJobId,
    jobStatus,
    bulkResults,
    isAnalyzing: startBulkAnalysisMutation.isPending,
    isLoadingStatus,
    isLoadingResults,
    isDemoRunning: demoAnalysisMutation.isPending,

    // Actions
    startBulkAnalysis,
    runDemo,
    resetJob,

    // Utilities
    getProcessingStats,
    formatProcessingTime,
    getConfidenceLevel,
    getRecommendedActions,

    // Errors
    analysisError: startBulkAnalysisMutation.error,
    demoError: demoAnalysisMutation.error,

    // Demo results
    demoResults: demoAnalysisMutation.data
  };
}

export type UseBulkAIMappingReturn = ReturnType<typeof useBulkAIMapping>;

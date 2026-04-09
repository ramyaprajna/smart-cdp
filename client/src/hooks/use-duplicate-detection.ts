/**
 * Duplicate Detection Hook
 *
 * React hook for managing duplicate detection workflow during data imports.
 * Handles user confirmation dialogs, duplicate analysis, and resolution strategies.
 *
 * Features:
 * - File-level and customer-level duplicate detection
 * - User-friendly confirmation workflow
 * - Multiple resolution strategies
 * - Integration with existing import system
 * - Error handling and loading states
 *
 * Created: August 14, 2025
 * Integrates with: duplicate-detection-service, simple-file-processor, import workflow
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

// Types matching server-side interfaces
interface DuplicateAnalysis {
  duplicateFiles: Array<{
    importId: string;
    fileName: string;
    importedAt: Date | null;
    importedBy: string | null;
    recordsSuccessful: number | null;
    fileHash: string;
  }>;
  duplicateCustomers: Array<{
    customer: any;
    existingMatches: Array<{
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phoneNumber?: string | null;
      importId?: string | null;
      sourceFileName?: string;
      importedAt?: Date | null;
      matchReason: 'email' | 'phone' | 'name_combination' | 'multiple_fields';
      matchConfidence: number;
    }>;
    rowNumber?: number;
  }>;
  summary: {
    fileDuplicatesCount: number;
    customerDuplicatesCount: number;
    totalIncomingRecords: number;
    uniqueNewRecords: number;
    duplicateRecordsCount: number;
  };
  recommendations: {
    action: 'proceed' | 'review_required' | 'abort';
    reason: string;
    options: string[];
  };
}

export interface DuplicateHandlingOptions {
  fileAction: 'skip' | 'overwrite' | 'append_suffix';
  customerAction: 'skip_duplicates' | 'overwrite_existing' | 'merge_data' | 'create_new';
  confirmationRequired: boolean;
}

interface UseDuplicateDetectionReturn {
  analyzeDuplicates: (filePath: string, fileName: string, incomingCustomers: any[]) => Promise<DuplicateAnalysis>;
  handleDuplicates: (importId: string, options: DuplicateHandlingOptions, analysisIdOverride?: string) => Promise<any>;
  checkFileDuplicates: (fileHash: string, fileName: string) => Promise<any>;
  lastAnalysisId: string | null;
  isAnalyzing: boolean;
  isHandling: boolean;
  isCheckingFile: boolean;
  error: string | null;
}

export const useDuplicateDetection = (): UseDuplicateDetectionReturn => {
  const [error, setError] = useState<string | null>(null);
  const [lastAnalysisId, setLastAnalysisId] = useState<string | null>(null);

  const analyzeDuplicatesMutation = useMutation({
    mutationFn: async ({ filePath, fileName, incomingCustomers }: {
      filePath: string;
      fileName: string;
      incomingCustomers: any[];
    }) => {
      const response = await fetch('/api/duplicates/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          fileName,
          incomingCustomers
        })
      });

      if (!response.ok) {
        throw new Error(`Duplicate analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.analysisId) {
        setLastAnalysisId(data.analysisId);
      }
      return data.analysis as DuplicateAnalysis;
    },
    onError: (error: any) => {
      console.error('Duplicate analysis failed:', {
        message: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      });
      setError(error.message || 'Failed to analyze duplicates');
    },
    onSuccess: () => {
      setError(null);
    }
  });

  const handleDuplicatesMutation = useMutation({
    mutationFn: async ({ importId, options, analysisId }: {
      importId: string;
      options: DuplicateHandlingOptions;
      analysisId: string;
    }) => {
      const response = await fetch(`/api/duplicates/${analysisId}/handle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importId,
          options
        })
      });

      if (!response.ok) {
        throw new Error(`Duplicate handling failed: ${response.statusText}`);
      }

      return response.json();
    },
    onError: (error: any) => {
      console.error('Duplicate handling failed:', {
        message: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      });
      setError(error.message || 'Failed to handle duplicates');
    },
    onSuccess: () => {
      setError(null);
    }
  });

  // Mutation for quick file duplicate checking
  const checkFileDuplicatesMutation = useMutation({
    mutationFn: async ({ fileHash, fileName }: {
      fileHash: string;
      fileName: string;
    }) => {
      const params = new URLSearchParams({
        fileHash,
        fileName
      });

      const response = await fetch(`/api/duplicates/file-check?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`File duplicate check failed: ${response.statusText}`);
      }

      return response.json();
    },
    onError: (error: any) => {
      console.error('File duplicate check failed:', {
        message: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n')
      });
      setError(error.message || 'Failed to check file duplicates');
    },
    onSuccess: () => {
      setError(null);
    }
  });

  // Public interface methods
  const analyzeDuplicates = useCallback(async (
    filePath: string,
    fileName: string,
    incomingCustomers: any[]
  ): Promise<DuplicateAnalysis> => {
    console.log('[DuplicateDetection] Starting duplicate analysis');

    const result = await analyzeDuplicatesMutation.mutateAsync({
      filePath,
      fileName,
      incomingCustomers
    });

    console.log('[DuplicateDetection] Analysis complete:', {
      fileDuplicates: result.summary.fileDuplicatesCount,
      customerDuplicates: result.summary.customerDuplicatesCount,
      recommendation: result.recommendations.action
    });

    return result;
  }, [analyzeDuplicatesMutation]);

  const handleDuplicates = useCallback(async (
    importId: string,
    options: DuplicateHandlingOptions,
    analysisIdOverride?: string
  ) => {
    const resolvedAnalysisId = analysisIdOverride || lastAnalysisId;
    if (!resolvedAnalysisId) {
      throw new Error('No analysis ID available. Please analyze duplicates first.');
    }

    const result = await handleDuplicatesMutation.mutateAsync({
      importId,
      options,
      analysisId: resolvedAnalysisId
    });

    setLastAnalysisId(null);
    return result;
  }, [handleDuplicatesMutation, lastAnalysisId]);

  const checkFileDuplicates = useCallback(async (
    fileHash: string,
    fileName: string
  ) => {

    const result = await checkFileDuplicatesMutation.mutateAsync({
      fileHash,
      fileName
    });

    return result;
  }, [checkFileDuplicatesMutation]);

  return {
    analyzeDuplicates,
    handleDuplicates,
    checkFileDuplicates,
    lastAnalysisId,
    isAnalyzing: analyzeDuplicatesMutation.isPending,
    isHandling: handleDuplicatesMutation.isPending,
    isCheckingFile: checkFileDuplicatesMutation.isPending,
    error
  };
};

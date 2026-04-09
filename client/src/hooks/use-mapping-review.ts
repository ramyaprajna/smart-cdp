/**
 * Mapping Review Hook
 *
 * Custom React hook for managing intelligent field mapping review workflow.
 * Handles file analysis, user review decisions, and final import approval.
 *
 * Security Features:
 * - Input validation for mapping decisions
 * - XSS protection for displayed data
 * - Secure API communication
 *
 * Performance Features:
 * - Optimized API calls with React Query
 * - Memoized calculations
 * - Efficient state management
 *
 * @created August 13, 2025 - Enhanced data import with intelligent mapping review
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Re-export types for convenience
export type {
  MappingDecision,
  UncertainMapping,
  MappingConflict,
  MappingReviewData
} from '@/components/mapping-review-modal';

import type {
  MappingDecision,
  MappingReviewData
} from '@/components/mapping-review-modal';

export interface MappingReviewHookResult {
  // State
  isAnalyzing: boolean;
  reviewData: MappingReviewData | null;
  needsReview: boolean;
  isApproving: boolean;

  // Actions
  analyzeFile: (file: File, maxSampleSize?: number) => Promise<MappingReviewData | null>;
  approveMapping: (decisions: MappingDecision[], autoApprove?: boolean) => Promise<boolean>;
  resetReview: () => void;

  // Status
  error: string | null;
}

/**
 * Security: File validation function
 */
const validateFile = (file: File): string | null => {
  // Check file type
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel', // xls
    'text/csv', // csv
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'text/plain' // txt
  ];

  if (!allowedTypes.includes(file.type)) {
    return `File type ${file.type} is not supported. Please use CSV, Excel, DOCX, or TXT files.`;
  }

  // Check file size (100MB limit for security)
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  if (file.size > MAX_FILE_SIZE) {
    return 'File is too large. Maximum file size is 100MB.';
  }

  // Check filename for security
  const filename = file.name;
  if (!filename || filename.length > 255) {
    return 'Invalid filename.';
  }

  // Prevent potentially dangerous filenames
  const dangerousPatterns = [
    /\.\./,  // Path traversal
    /[<>:"|?*]/,  // Dangerous characters
    /\x00/   // Null bytes
  ];

  if (dangerousPatterns.some(pattern => pattern.test(filename))) {
    return 'Filename contains invalid characters.';
  }

  return null;
};

/**
 * Security: API request helper with error handling
 */
const apiRequest = async (url: string, options: RequestInit = {}): Promise<any> => {
  try {
    const response = await fetch(url, {
      credentials: 'include', // Include cookies for authentication
      headers: {
        'X-Requested-With': 'XMLHttpRequest', // CSRF protection
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network request failed');
  }
};

/**
 * Main mapping review hook
 */
export function useMappingReview(): MappingReviewHookResult {
  const [reviewData, setReviewData] = useState<MappingReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Performance: Memoized computed values
  const needsReview = useMemo(() =>
    reviewData?.needsReview ?? false,
    [reviewData?.needsReview]
  );

  // File analysis mutation
  const analyzeFileMutation = useMutation({
    mutationFn: async ({ file, maxSampleSize = 100 }: {
      file: File;
      maxSampleSize?: number;
    }): Promise<MappingReviewData> => {
      // Security: Validate file before upload
      const validationError = validateFile(file);
      if (validationError) {
        throw new Error(validationError);
      }

      // Prepare form data for secure upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('maxSampleSize', Math.min(Math.max(maxSampleSize, 10), 1000).toString());

      const response = await apiRequest('/api/mapping-review/analyze', {
        method: 'POST',
        body: formData
      });

      return response.reviewData;
    },
    onSuccess: (data) => {
      setReviewData(data);
      setError(null);

      if (data.needsReview) {
        toast({
          title: "Review required",
          description: `${data.uncertainMappings.length} field mappings need your review`
        });
      } else {
        toast({
          title: "Analysis complete",
          description: `All ${data.totalMappings} fields mapped successfully`
        });
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'File analysis failed';
      setError(message);
      setReviewData(null);

      toast({
        title: "Analysis failed",
        description: message,
        variant: "destructive"
      });
    }
  });

  // Mapping approval mutation
  const approveMappingMutation = useMutation({
    mutationFn: async ({
      decisions,
      autoApprove = false
    }: {
      decisions: MappingDecision[];
      autoApprove?: boolean;
    }): Promise<any> => {
      // Security: Validate decisions
      if (!Array.isArray(decisions) || decisions.length === 0) {
        throw new Error('No mapping decisions provided');
      }

      // Security: Sanitize each decision
      const sanitizedDecisions = decisions.map(decision => {
        if (!decision.sourceField || !decision.targetField) {
          throw new Error('Invalid mapping decision format');
        }

        return {
          sourceField: decision.sourceField.substring(0, 50).trim(),
          targetField: decision.targetField.substring(0, 50).trim(),
          confidence: Math.max(0, Math.min(100, decision.confidence || 100))
        };
      });

      const response = await apiRequest('/api/mapping-review/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decisions: sanitizedDecisions,
          autoApprove
        })
      });

      return response;
    },
    onSuccess: (response) => {
      setError(null);

      toast({
        title: "Mapping approved",
        description: `${response.processedDecisions?.length || 0} field mappings have been approved`
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Mapping approval failed';
      setError(message);

      toast({
        title: "Approval failed",
        description: message,
        variant: "destructive"
      });
    }
  });

  // Public API
  const analyzeFile = useCallback(async (file: File, maxSampleSize = 100): Promise<MappingReviewData | null> => {
    try {
      const result = await analyzeFileMutation.mutateAsync({ file, maxSampleSize });
      return result;
    } catch (error) {
      console.error('File analysis failed:', error);
      return null;
    }
  }, [analyzeFileMutation]);

  const approveMapping = useCallback(async (
    decisions: MappingDecision[],
    autoApprove = false
  ): Promise<boolean> => {
    try {
      await approveMappingMutation.mutateAsync({ decisions, autoApprove });
      return true;
    } catch (error) {
      console.error('Mapping approval failed:', error);
      return false;
    }
  }, [approveMappingMutation]);

  const resetReview = useCallback(() => {
    setReviewData(null);
    setError(null);
  }, []);

  return {
    // State
    isAnalyzing: analyzeFileMutation.isPending,
    reviewData,
    needsReview,
    isApproving: approveMappingMutation.isPending,

    // Actions
    analyzeFile,
    approveMapping,
    resetReview,

    // Status
    error
  };
}

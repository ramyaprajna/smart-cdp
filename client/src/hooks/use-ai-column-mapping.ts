/**
 * useAIColumnMapping Hook
 *
 * React hook for AI-powered column mapping functionality.
 * Provides methods to analyze files and get intelligent column mapping suggestions.
 *
 * Features:
 * - AI-powered file analysis with OpenAI integration
 * - Automatic column-to-field mapping with confidence scores
 * - Real-time mapping validation and suggestions
 * - Error handling and fallback mechanisms
 * - Integration with existing import workflow
 *
 * Last Updated: July 23, 2025
 * Integration Status: ✅ NEW - AI-powered import enhancement
 */

import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

/**
 * Column analysis result from AI service
 */
export interface AIColumnAnalysis {
  columnName: string;
  originalName: string;
  suggestedField: string | null;
  confidence: number;
  dataType: 'text' | 'email' | 'phone' | 'date' | 'number' | 'boolean' | 'json' | 'uuid';
  patterns: {
    format: string;
    examples: string[];
    uniqueValues: number;
    nullCount: number;
    avgLength: number;
  };
  reasoning: string;
  warnings: string[];
  shouldExclude: boolean;
  exclusionReason?: string;
  customAttributeSuggestion?: {
    shouldCreate: boolean;
    attributeName: string;
    category: 'demographics' | 'preferences' | 'behaviors' | 'engagement' | 'technical';
  };
}

/**
 * Complete AI mapping result
 */
export interface AIColumnMappingResult {
  mappings: AIColumnAnalysis[];
  overallConfidence: number;
  suggestedExclusions: string[];
  processingNotes: string[];
  estimatedAccuracy: number;
  recommendedActions: string[];
}

/**
 * File analysis response
 */
interface AIAnalysisResponse {
  success: boolean;
  analysis: AIColumnMappingResult;
  fileInfo: {
    name: string;
    size: number;
    totalRows: number;
    totalColumns: number;
  };
  error?: string;
}

/**
 * Database schema information
 */
interface DatabaseSchema {
  tables: {
    customers: {
      description: string;
      fields: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
        examples: string[];
      }>;
    };
  };
}

export function useAIColumnMapping() {
  const [analysisState, setAnalysisState] = useState<{
    isAnalyzing: boolean;
    currentFile: string | null;
    progress: number;
    status: string;
  }>({
    isAnalyzing: false,
    currentFile: null,
    progress: 0,
    status: ''
  });

  // Get database schema for reference
  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ['/api/ai-mapping/schema'],
    staleTime: 10 * 60 * 1000, // 10 minutes - schema doesn't change often
  });

  // AI file analysis mutation
  const analyzeFileMutation = useMutation({
    mutationFn: async ({ file, maxSampleSize = 100 }: {
      file: File;
      maxSampleSize?: number;
    }): Promise<AIAnalysisResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('maxSampleSize', maxSampleSize.toString());

      setAnalysisState(prev => ({
        ...prev,
        isAnalyzing: true,
        currentFile: file.name,
        progress: 10,
        status: 'Uploading file...'
      }));

      const response = await fetch('/api/ai-mapping/analyze', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'AI analysis failed');
      }

      return result;
    },
    onSuccess: () => {
      setAnalysisState(prev => ({
        ...prev,
        progress: 100,
        status: 'Analysis complete!'
      }));
    },
    onError: (error) => {
      console.error('AI analysis failed:', error);
      setAnalysisState(prev => ({
        ...prev,
        progress: 0,
        status: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
    },
    onSettled: () => {
      // Reset analyzing state after a brief delay
      setTimeout(() => {
        setAnalysisState(prev => ({
          ...prev,
          isAnalyzing: false,
          currentFile: null,
          progress: 0,
          status: ''
        }));
      }, 2000);
    }
  });

  // Validate mapping suggestions
  const validateMappingMutation = useMutation({
    mutationFn: async ({ mappings, originalHeaders }: {
      mappings: AIColumnAnalysis[];
      originalHeaders: string[];
    }) => {
      const response = await fetch('/api/ai-mapping/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings, originalHeaders }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      return await response.json();
    }
  });

  // Get suggestion for specific column
  const getColumnSuggestionMutation = useMutation({
    mutationFn: async ({ columnName, sampleData, allHeaders }: {
      columnName: string;
      sampleData: any[];
      allHeaders: string[];
    }) => {
      const response = await fetch('/api/ai-mapping/suggest-column', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnName, sampleData, allHeaders }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Suggestion failed: ${response.statusText}`);
      }

      return await response.json();
    }
  });

  /**
   * Analyze file with AI and get column mapping suggestions
   */
  const analyzeFile = useCallback(async (file: File, maxSampleSize = 100) => {
    try {
      setAnalysisState(prev => ({
        ...prev,
        status: 'Starting AI analysis...'
      }));

      const result = await analyzeFileMutation.mutateAsync({ file, maxSampleSize });
      return result;
    } catch (error) {
      console.error('File analysis error:', error);
      throw error;
    }
  }, [analyzeFileMutation]);

  /**
   * Validate mapping suggestions and get recommendations
   */
  const validateMappings = useCallback(async (
    mappings: AIColumnAnalysis[],
    originalHeaders: string[]
  ) => {
    return await validateMappingMutation.mutateAsync({ mappings, originalHeaders });
  }, [validateMappingMutation]);

  /**
   * Get AI suggestion for specific column
   */
  const getColumnSuggestion = useCallback(async (
    columnName: string,
    sampleData: any[],
    allHeaders: string[]
  ) => {
    return await getColumnSuggestionMutation.mutateAsync({
      columnName,
      sampleData,
      allHeaders
    });
  }, [getColumnSuggestionMutation]);

  /**
   * Generate field mappings from AI analysis for import processing
   */
  const generateFieldMappings = useCallback((analysis: AIColumnMappingResult): Record<string, string> => {
    const mappings: Record<string, string> = {};

    analysis.mappings
      .filter(m => m.suggestedField && !m.shouldExclude && m.confidence > 50)
      .forEach(m => {
        mappings[m.originalName] = m.suggestedField!;
      });

    return mappings;
  }, []);

  /**
   * Get mapping statistics
   */
  const getMappingStats = useCallback((analysis: AIColumnMappingResult) => {
    const totalColumns = analysis.mappings.length;
    const mappedColumns = analysis.mappings.filter(m => m.suggestedField && !m.shouldExclude).length;
    const highConfidenceColumns = analysis.mappings.filter(m => m.confidence > 80 && !m.shouldExclude).length;
    const excludedColumns = analysis.mappings.filter(m => m.shouldExclude).length;
    const warningColumns = analysis.mappings.filter(m => m.warnings.length > 0).length;

    return {
      totalColumns,
      mappedColumns,
      highConfidenceColumns,
      excludedColumns,
      warningColumns,
      mappingPercentage: totalColumns > 0 ? Math.round((mappedColumns / totalColumns) * 100) : 0,
      readyForImport: analysis.overallConfidence > 70 && excludedColumns === 0
    };
  }, []);

  /**
   * Format confidence score for display
   */
  const formatConfidence = useCallback((confidence: number): string => {
    if (confidence >= 90) return 'Excellent';
    if (confidence >= 70) return 'Good';
    if (confidence >= 50) return 'Fair';
    return 'Low';
  }, []);

  /**
   * Get confidence color for UI
   */
  const getConfidenceColor = useCallback((confidence: number): string => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-blue-600';
    if (confidence >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }, []);

  return {
    // State
    isAnalyzing: analysisState.isAnalyzing,
    analysisProgress: analysisState.progress,
    analysisStatus: analysisState.status,
    currentFile: analysisState.currentFile,

    // Data
    databaseSchema: schema as DatabaseSchema,
    schemaLoading,

    // Mutations
    isValidating: validateMappingMutation.isPending,
    isSuggesting: getColumnSuggestionMutation.isPending,

    // Methods
    analyzeFile,
    validateMappings,
    getColumnSuggestion,
    generateFieldMappings,
    getMappingStats,
    formatConfidence,
    getConfidenceColor,

    // Error states
    analysisError: analyzeFileMutation.error,
    validationError: validateMappingMutation.error,
    suggestionError: getColumnSuggestionMutation.error,
  };
}

export type UseAIColumnMappingReturn = ReturnType<typeof useAIColumnMapping>;

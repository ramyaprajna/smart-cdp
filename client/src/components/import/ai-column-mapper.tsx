/**
 * AI Column Mapper Component
 *
 * React component for AI-powered column mapping interface.
 * Provides visual column analysis, mapping suggestions, and user feedback.
 *
 * Features:
 * - Visual column analysis with confidence scores
 * - Interactive mapping suggestions with explanations
 * - Field exclusion recommendations and warnings
 * - Real-time validation and feedback
 * - Integration with import workflow
 *
 * Last Updated: July 23, 2025
 * Integration Status: ✅ NEW - AI-powered import enhancement
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Brain,
  FileText,
  TrendingUp,
  Info,
  RefreshCw,
  Download
} from 'lucide-react';
import {
  useAIColumnMapping,
  type AIColumnAnalysis,
  type AIColumnMappingResult
} from '@/hooks/use-ai-column-mapping';

interface AIColumnMapperProps {
  file: File | null;
  onMappingComplete: (mappings: Record<string, string>, analysis: AIColumnMappingResult) => void;
  onError: (error: string) => void;
  className?: string;
}

/**
 * Individual column analysis display component
 */
const ColumnAnalysisCard: React.FC<{
  analysis: AIColumnAnalysis;
  onRefresh?: () => void;
}> = ({ analysis, onRefresh }) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 70) return 'bg-blue-500';
    if (confidence >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getDataTypeIcon = (dataType: string) => {
    switch (dataType) {
      case 'email': return '📧';
      case 'phone': return '📞';
      case 'date': return '📅';
      case 'number': return '🔢';
      default: return '📝';
    }
  };

  return (
    <Card className={`transition-all duration-200 ${
      analysis.shouldExclude ? 'opacity-60 border-red-200' : 'hover:shadow-md'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="text-lg">{getDataTypeIcon(analysis.dataType)}</span>
            {analysis.originalName}
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Mapping Suggestion */}
        <div className="space-y-2">
          {analysis.suggestedField && !analysis.shouldExclude ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">
                Maps to: <code className="bg-blue-50 px-1 py-0.5 rounded text-xs">
                  {analysis.suggestedField}
                </code>
              </span>
            </div>
          ) : analysis.customAttributeSuggestion?.shouldCreate ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">
                Custom Attribute: <code className="bg-purple-50 px-1 py-0.5 rounded text-xs">
                  {analysis.customAttributeSuggestion.attributeName}
                </code>
                <Badge variant="outline" className="ml-2 text-xs">
                  {analysis.customAttributeSuggestion.category}
                </Badge>
              </span>
            </div>
          ) : analysis.shouldExclude ? (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-600">Excluded</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-600">No mapping</span>
            </div>
          )}

          {/* Confidence Score */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Progress
                value={analysis.confidence}
                className="h-2"
              />
            </div>
            <Badge
              variant="secondary"
              className={`text-xs ${
                analysis.confidence >= 70 ? 'bg-green-100 text-green-800' :
                analysis.confidence >= 50 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}
            >
              {analysis.confidence}%
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Data Patterns */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-600">Data Patterns</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Format: <span className="font-medium">{analysis.patterns.format}</span></div>
            <div>Unique: <span className="font-medium">{analysis.patterns.uniqueValues}</span></div>
            <div>Avg Length: <span className="font-medium">{analysis.patterns.avgLength}</span></div>
            <div>Nulls: <span className="font-medium">{analysis.patterns.nullCount}</span></div>
          </div>

          {analysis.patterns.examples.length > 0 && (
            <div>
              <span className="text-xs text-gray-600">Examples: </span>
              <span className="text-xs font-mono bg-gray-50 px-1 py-0.5 rounded">
                {analysis.patterns.examples.slice(0, 2).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* AI Reasoning */}
        {analysis.reasoning && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Brain className="h-3 w-3" />
                AI Analysis
              </h4>
              <p className="text-xs text-gray-700 leading-relaxed">
                {analysis.reasoning}
              </p>
            </div>
          </>
        )}

        {/* Warnings */}
        {analysis.warnings.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-yellow-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Warnings
              </h4>
              <ul className="text-xs text-yellow-700 space-y-1">
                {analysis.warnings.map((warning, index) => (
                  <li key={index} className="flex items-start gap-1">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Exclusion Reason */}
        {analysis.shouldExclude && analysis.exclusionReason && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-red-600 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Exclusion Reason
              </h4>
              <p className="text-xs text-red-700">
                {analysis.exclusionReason}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Main AI Column Mapper component
 */
export const AIColumnMapper: React.FC<AIColumnMapperProps> = ({
  file,
  onMappingComplete,
  onError,
  className = ''
}) => {
  const [analysisResult, setAnalysisResult] = useState<AIColumnMappingResult | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  const {
    isAnalyzing,
    analysisProgress,
    analysisStatus,
    analyzeFile,
    generateFieldMappings,
    getMappingStats,
    formatConfidence,
    analysisError
  } = useAIColumnMapping();

  /**
   * Handle file analysis
   */
  const handleAnalyzeFile = useCallback(async () => {
    if (!file) {
      onError('No file selected for analysis');
      return;
    }

    try {
      const result = await analyzeFile(file, 100);
      setAnalysisResult(result.analysis);
    } catch (error) {
      console.error('Analysis failed:', error);
      onError(error instanceof Error ? error.message : 'Analysis failed');
    }
  }, [file, analyzeFile, onError]);

  /**
   * Handle mapping completion
   */
  const handleComplete = useCallback(() => {
    if (!analysisResult) return;

    const fieldMappings = generateFieldMappings(analysisResult);
    onMappingComplete(fieldMappings, analysisResult);
  }, [analysisResult, generateFieldMappings, onMappingComplete]);

  /**
   * Export analysis results
   */
  const handleExportAnalysis = useCallback(() => {
    if (!analysisResult) return;

    const exportData = {
      timestamp: new Date().toISOString(),
      fileName: file?.name,
      analysis: analysisResult,
      mappings: generateFieldMappings(analysisResult)
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-analysis-${file?.name}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResult, file, generateFieldMappings]);

  // Show error state
  if (analysisError) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          AI analysis failed: {analysisError instanceof Error ? analysisError.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  // Show initial state
  if (!file) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            AI Column Mapping
          </CardTitle>
          <CardDescription>
            Upload a file to get AI-powered column mapping suggestions
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Show analysis in progress
  if (isAnalyzing) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600 animate-pulse" />
            Analyzing File with AI
          </CardTitle>
          <CardDescription>
            {analysisStatus}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={analysisProgress} className="w-full" />
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              {file.name} ({Math.round(file.size / 1024)}KB)
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show analysis button
  if (!analysisResult) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            AI Column Mapping
          </CardTitle>
          <CardDescription>
            Get intelligent column mapping suggestions for your file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              {file.name} ({Math.round(file.size / 1024)}KB)
            </div>

            <Button
              onClick={handleAnalyzeFile}
              className="w-full"
            >
              <Brain className="h-4 w-4 mr-2" />
              Analyze with AI
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show analysis results
  const stats = getMappingStats(analysisResult);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" />
                AI Analysis Complete
              </CardTitle>
              <CardDescription>
                {formatConfidence(analysisResult.overallConfidence)} confidence • {stats.mappedColumns}/{stats.totalColumns} columns mapped
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportAnalysis}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.mappingPercentage}%</div>
              <div className="text-xs text-gray-600">Mapped</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.highConfidenceColumns}</div>
              <div className="text-xs text-gray-600">High Confidence</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.excludedColumns}</div>
              <div className="text-xs text-gray-600">Excluded</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.warningColumns}</div>
              <div className="text-xs text-gray-600">Warnings</div>
            </div>
          </div>

          {/* Processing Notes */}
          {analysisResult.processingNotes.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Processing Notes
              </h4>
              <ul className="text-sm text-gray-600 space-y-1">
                {analysisResult.processingNotes.map((note, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Actions */}
          {analysisResult.recommendedActions.length > 0 && (
            <Alert className="mb-4">
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                <strong>Recommendations:</strong>
                <ul className="mt-2 space-y-1">
                  {analysisResult.recommendedActions.map((action, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setShowDetails(!showDetails)}
              variant="outline"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>

            <Button
              onClick={handleComplete}
              disabled={!stats.readyForImport && stats.excludedColumns > 0}
              className="flex-1"
            >
              {stats.readyForImport ? 'Use AI Mappings' : 'Review & Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Column Analysis */}
      {showDetails && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Column Analysis Details</h3>
            <Badge variant="secondary">
              {analysisResult.mappings.length} columns
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysisResult.mappings.map((mapping, index) => (
              <ColumnAnalysisCard
                key={`${mapping.originalName}-${index}`}
                analysis={mapping}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIColumnMapper;

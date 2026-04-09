/**
 * Bulk AI Mapper Component
 *
 * React component for bulk AI analysis and mapping functionality.
 * Handles multiple file upload, progress tracking, and results display.
 *
 * Features:
 * - Multiple file upload with drag & drop
 * - Real-time progress tracking
 * - Bulk analysis results summary
 * - Conflict resolution interface
 * - Export functionality
 *
 * Last Updated: July 23, 2025
 * Integration Status: ✅ NEW - Bulk AI processing enhancement
 */

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  Brain,
  CheckCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  X,
  TrendingUp,
  Clock,
  BarChart3
} from 'lucide-react';
import { useBulkAIMapping } from '@/hooks/use-bulk-ai-mapping';

interface BulkAIMapperProps {
  onMappingComplete?: (mappings: Record<string, string>) => void;
  onError?: (error: string) => void;
  className?: string;
}

/**
 * File upload component with drag & drop
 */
const FileUploadZone: React.FC<{
  onFilesSelected: (files: FileList) => void;
  isProcessing: boolean;
}> = ({ onFilesSelected, isProcessing }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.json,.txt"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isProcessing}
      />

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Upload Multiple Files for Bulk Analysis
        </h3>
        <p className="text-sm text-gray-600">
          Drag and drop multiple files here, or click to browse
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Supports CSV, Excel, JSON, and TXT files (up to 10 files)
        </p>
      </div>
    </div>
  );
};

/**
 * Processing status component
 */
const ProcessingStatus: React.FC<{
  jobStatus: any;
  processingStats: any;
  formatProcessingTime: (ms: number) => string;
}> = ({ jobStatus, processingStats, formatProcessingTime }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'processing': return <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />;
      default: return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  if (!jobStatus) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon(jobStatus.status)}
          Bulk Analysis Progress
        </CardTitle>
        <CardDescription>
          Processing {jobStatus.filesCount} files with AI analysis
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span className={getStatusColor(jobStatus.status)}>
              {jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}
            </span>
          </div>
          <Progress value={jobStatus.progress} className="w-full" />
          <div className="flex justify-between text-xs text-gray-600">
            <span>{jobStatus.completedCount} / {jobStatus.filesCount} files</span>
            <span>{jobStatus.progress}% complete</span>
          </div>
        </div>

        {processingStats && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {processingStats.filesProcessed}
              </div>
              <div className="text-xs text-gray-600">Files Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatProcessingTime(processingStats.processingTime)}
              </div>
              <div className="text-xs text-gray-600">Processing Time</div>
            </div>
          </div>
        )}

        {jobStatus.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{jobStatus.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Results summary component
 */
const ResultsSummary: React.FC<{
  results: any;
  getConfidenceLevel: (confidence: number) => string;
  getRecommendedActions: (results: any) => string[];
  formatProcessingTime: (ms: number) => string;
  onExport: () => void;
  onUseMappings: () => void;
}> = ({ results, getConfidenceLevel, getRecommendedActions, formatProcessingTime, onExport, onUseMappings }) => {
  const successRate = Math.round((results.successfulMappings / results.totalColumns) * 100);
  const actions = getRecommendedActions(results);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Bulk Analysis Results
            </CardTitle>
            <CardDescription>
              {getConfidenceLevel(results.averageConfidence)} confidence • {successRate}% mapping success
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{results.totalFiles}</div>
            <div className="text-xs text-gray-600">Files Analyzed</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{results.successfulMappings}</div>
            <div className="text-xs text-gray-600">Successful Mappings</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{results.averageConfidence}%</div>
            <div className="text-xs text-gray-600">Avg Confidence</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatProcessingTime(results.processingTime)}
            </div>
            <div className="text-xs text-gray-600">Total Time</div>
          </div>
        </div>

        {/* Recommended Mappings */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Recommended Field Mappings ({Object.keys(results.recommendedMappings).length})
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {Object.entries(results.recommendedMappings).map(([column, field]) => (
              <div key={column} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                <span className="text-sm font-medium text-gray-700">{column}</span>
                <Badge variant="secondary" className="text-xs">
                  {field as string}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Conflicts */}
        {results.conflictingMappings.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Conflicting Mappings ({results.conflictingMappings.length})
            </h4>
            <div className="space-y-2">
              {results.conflictingMappings.slice(0, 3).map((conflict: any, index: number) => (
                <div key={index} className="p-2 border border-yellow-200 bg-yellow-50 rounded">
                  <div className="font-medium text-sm text-yellow-800">{conflict.columnName}</div>
                  <div className="flex gap-1 mt-1">
                    {conflict.suggestions.map((suggestion: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {suggestion} ({Math.round(conflict.confidence[i])}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Actions */}
        {actions.length > 0 && (
          <div>
            <h4 className="font-medium mb-3">Recommended Actions</h4>
            <ul className="space-y-1">
              {actions.map((action, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-1">•</span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={onUseMappings}
            className="flex-1"
            disabled={successRate < 50}
          >
            Use AI Mappings ({successRate}% ready)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Main Bulk AI Mapper component
 */
export const BulkAIMapper: React.FC<BulkAIMapperProps> = ({
  onMappingComplete,
  onError,
  className = ''
}) => {
  const {
    currentJobId,
    jobStatus,
    bulkResults,
    isAnalyzing,
    isDemoRunning,
    startBulkAnalysis,
    runDemo,
    resetJob,
    getProcessingStats,
    formatProcessingTime,
    getConfidenceLevel,
    getRecommendedActions,
    analysisError,
    demoError,
    demoResults
  } = useBulkAIMapping();

  const processingStats = getProcessingStats();

  const handleFilesSelected = useCallback(async (files: FileList) => {
    try {
      await startBulkAnalysis(files, {
        maxSampleSize: 100,
        enableCaching: true
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to start bulk analysis');
    }
  }, [startBulkAnalysis, onError]);

  const handleRunDemo = useCallback(async () => {
    try {
      await runDemo();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Demo failed');
    }
  }, [runDemo, onError]);

  const handleExportResults = useCallback(() => {
    if (!bulkResults) return;

    const exportData = {
      timestamp: new Date().toISOString(),
      bulkAnalysis: bulkResults,
      jobId: currentJobId
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-ai-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bulkResults, currentJobId]);

  const handleUseMappings = useCallback(() => {
    if (bulkResults && onMappingComplete) {
      onMappingComplete(bulkResults.recommendedMappings);
    }
  }, [bulkResults, onMappingComplete]);

  // Show error state
  if (analysisError || demoError) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {analysisError?.message || demoError?.message || 'Bulk analysis failed'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            Bulk AI Column Mapping
          </CardTitle>
          <CardDescription>
            Upload multiple files for simultaneous AI analysis and mapping recommendations
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex gap-3">
            <Button
              onClick={handleRunDemo}
              disabled={isDemoRunning || isAnalyzing}
              variant="outline"
            >
              {isDemoRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running Demo...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Run Demo Analysis
                </>
              )}
            </Button>

            {currentJobId && (
              <Button onClick={resetJob} variant="outline">
                <X className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Demo Results */}
      {demoResults && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Demo Analysis Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-700">Sample Columns</div>
                <div className="text-green-600">{demoResults.demo.sampleHeaders.length}</div>
              </div>
              <div>
                <div className="font-medium text-green-700">Records Analyzed</div>
                <div className="text-green-600">{demoResults.demo.sampleDataCount}</div>
              </div>
              <div>
                <div className="font-medium text-green-700">Confidence</div>
                <div className="text-green-600">{demoResults.demo.analysisResult.overallConfidence}%</div>
              </div>
              <div>
                <div className="font-medium text-green-700">Mappings Found</div>
                <div className="text-green-600">{Object.keys(demoResults.demo.mappingSuggestions).length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload */}
      {!currentJobId && (
        <FileUploadZone
          onFilesSelected={handleFilesSelected}
          isProcessing={isAnalyzing}
        />
      )}

      {/* Processing Status */}
      {jobStatus && (
        <ProcessingStatus
          jobStatus={jobStatus}
          processingStats={processingStats}
          formatProcessingTime={formatProcessingTime}
        />
      )}

      {/* Results */}
      {bulkResults && (
        <ResultsSummary
          results={bulkResults}
          getConfidenceLevel={getConfidenceLevel}
          getRecommendedActions={getRecommendedActions}
          formatProcessingTime={formatProcessingTime}
          onExport={handleExportResults}
          onUseMappings={handleUseMappings}
        />
      )}
    </div>
  );
};

export default BulkAIMapper;

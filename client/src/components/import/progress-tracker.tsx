/**
 * Progress Tracker Component
 *
 * Comprehensive real-time progress tracking for data import operations with
 * timeout handling, resume capabilities, and detailed completion statistics.
 *
 * Features:
 * - Real-time progress visualization with percentage completion
 * - Processing speed and estimated completion time
 * - Timeout detection with 'Continue Import' button functionality
 * - Resume from last processed record while preserving import settings
 * - Detailed batch and record statistics
 * - Status indicators for different import phases
 *
 * Last Updated: August 14, 2025
 * Integration Status: ✅ NEW - Complete progress tracking system
 */

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Activity,
  FileText,
  Users
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ImportProgress, ResumeOptions } from '@/types/import';

interface ProgressTrackerProps {
  progress: ImportProgress;
  onResume: (options: ResumeOptions) => void;
  onCancel: () => void;
  className?: string;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  progress,
  onResume,
  onCancel,
  className = ''
}) => {
  const {
    totalRecords,
    processedRecords,
    successfulRecords,
    failedRecords,
    currentBatch,
    totalBatches,
    startTime,
    lastUpdateTime,
    estimatedCompletion,
    processingSpeed,
    status,
    importSessionId,
    currentOperation,
    lastProcessedRecord,
    duplicatesHandled = 0,
    canResume = false,
    errorMessage
  } = progress;

  // Calculate progress percentage
  const progressPercentage = totalRecords > 0 ? Math.round((processedRecords / totalRecords) * 100) : 0;

  // Calculate batch progress
  const batchProgress = totalBatches > 0 ? Math.round((currentBatch / totalBatches) * 100) : 0;

  // Format processing speed
  const formatSpeed = (speed: number) => {
    if (speed < 1) return `${(speed * 60).toFixed(1)}/min`;
    return `${speed.toFixed(1)}/sec`;
  };

  // Format time estimates
  const formatTimeEstimate = (date: Date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'calculating...';
    }
  };

  // Get status color and icon
  const getStatusDisplay = () => {
    switch (status) {
      case 'starting':
        return { color: 'text-blue-600', icon: Activity, text: 'Starting...' };
      case 'processing':
        return { color: 'text-green-600', icon: Play, text: 'Processing' };
      case 'timeout':
        return { color: 'text-yellow-600', icon: AlertTriangle, text: 'Timeout Detected' };
      case 'paused':
        return { color: 'text-gray-600', icon: Pause, text: 'Paused' };
      case 'completed':
        return { color: 'text-green-600', icon: CheckCircle, text: 'Completed' };
      case 'error':
        return { color: 'text-red-600', icon: XCircle, text: 'Error' };
      default:
        return { color: 'text-gray-600', icon: Activity, text: 'Unknown' };
    }
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  // Handle resume action
  const handleResume = () => {
    if (!canResume || !lastProcessedRecord) return;

    const resumeOptions: ResumeOptions = {
      importSessionId,
      lastProcessedRecord,
      duplicateHandlingStrategy: 'skip_duplicates', // Default strategy
      preservedSettings: {
        originalTotalRecords: totalRecords,
        startTime: startTime.toISOString(),
        currentOperation,
        resumedAt: new Date().toISOString()
      }
    };

    onResume(resumeOptions);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <StatusIcon className={`w-5 h-5 ${statusDisplay.color}`} />
              <CardTitle className="text-lg">Import Progress</CardTitle>
            </div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span className={statusDisplay.color}>{statusDisplay.text}</span>
              {importSessionId && (
                <span className="font-mono text-xs">#{importSessionId.slice(-8)}</span>
              )}
            </div>
          </div>
          <CardDescription>
            {currentOperation || 'Processing your data import...'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{processedRecords.toLocaleString()} of {totalRecords.toLocaleString()} records</span>
              {processingSpeed > 0 && (
                <span>Speed: {formatSpeed(processingSpeed)}</span>
              )}
            </div>
          </div>

          {/* Batch Progress (if applicable) */}
          {totalBatches > 1 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Batch Progress</span>
                <span className="font-medium">{batchProgress}%</span>
              </div>
              <Progress value={batchProgress} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Batch {currentBatch} of {totalBatches}
              </div>
            </div>
          )}

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{successfulRecords.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600">{failedRecords.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-yellow-600">{duplicatesHandled.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Duplicates</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{totalRecords.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {/* Time Information */}
          <div className="flex justify-between items-center text-sm text-muted-foreground pt-2 border-t">
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>Started: {formatTimeEstimate(startTime)}</span>
            </div>
            {estimatedCompletion && status === 'processing' && (
              <div className="flex items-center space-x-1">
                <span>ETA: {formatTimeEstimate(estimatedCompletion)}</span>
              </div>
            )}
          </div>

          {/* Timeout Warning and Resume Button */}
          {status === 'timeout' && canResume && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Import process has timed out. You can continue from where it left off
                (record {lastProcessedRecord?.toLocaleString()}) while preserving all your settings.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {status === 'error' && errorMessage && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-xs text-muted-foreground">
              Last updated: {formatTimeEstimate(lastUpdateTime)}
            </div>

            <div className="flex space-x-2">
              {status === 'timeout' && canResume && lastProcessedRecord && (
                <Button
                  onClick={handleResume}
                  size="sm"
                  className="min-w-32"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Continue Import
                </Button>
              )}

              {(status === 'processing' || status === 'timeout') && (
                <Button
                  onClick={onCancel}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              )}

              {status === 'completed' && (
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Import Complete!</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressTracker;

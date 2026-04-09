import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Zap, CheckCircle, AlertCircle } from 'lucide-react';

interface EmbeddingProgress {
  importId: string;
  totalCustomers: number;
  processedCustomers: number;
  generatedEmbeddings: number;
  failedEmbeddings: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedTimeRemaining?: string;
  currentBatch?: number;
  totalBatches?: number;
  startedAt?: Date;
  completedAt?: Date;
  errors: string[];
}

interface EmbeddingProgressProps {
  importId: string;
  onComplete?: () => void;
}

export function EmbeddingProgressTracker({ importId, onComplete }: EmbeddingProgressProps) {
  const { data: progress, isLoading } = useQuery({
    queryKey: ['embedding-progress', importId],
    queryFn: async () => {
      const response = await fetch(`/api/imports/${importId}/embeddings/progress`);
      if (!response.ok) {
        throw new Error('Failed to fetch embedding progress');
      }
      const result = await response.json();
      return result.progress as EmbeddingProgress;
    },
    refetchInterval: (query) => {
      // Stop polling when completed or failed
      const data = query?.state?.data;
      if (!data) return 2000;
      return data.status === 'completed' || data.status === 'failed' ? false : 2000;
    },
    enabled: !!importId
  });

  React.useEffect(() => {
    if (progress?.status === 'completed' && onComplete) {
      onComplete();
    }
  }, [progress?.status, onComplete]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-sm text-muted-foreground">Loading embedding status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return null;
  }

  const completionPercentage = Math.round((progress.generatedEmbeddings / progress.totalCustomers) * 100);
  const processingPercentage = Math.round((progress.processedCustomers / progress.totalCustomers) * 100);

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <Zap className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'processing':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Vector Embedding Generation</CardTitle>
            <CardDescription>
              Generating semantic embeddings for {progress.totalCustomers.toLocaleString()} customers
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <Badge variant="outline" className={`${getStatusColor()} text-white`}>
              {progress.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Embeddings Generated</span>
            <span>{progress.generatedEmbeddings.toLocaleString()} / {progress.totalCustomers.toLocaleString()} ({completionPercentage}%)</span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>

        {/* Batch Progress (if processing) */}
        {progress.status === 'processing' && progress.currentBatch && progress.totalBatches && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Current Batch</span>
              <span>{progress.currentBatch} / {progress.totalBatches}</span>
            </div>
            <Progress
              value={(progress.currentBatch / progress.totalBatches) * 100}
              className="h-1"
            />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Processed</div>
            <div className="font-medium">{progress.processedCustomers.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Failed</div>
            <div className="font-medium text-red-600">{progress.failedEmbeddings.toLocaleString()}</div>
          </div>
        </div>

        {/* Time Estimate */}
        {progress.estimatedTimeRemaining && progress.status === 'processing' && (
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Estimated time remaining: {progress.estimatedTimeRemaining}</span>
          </div>
        )}

        {/* Error Summary */}
        {progress.errors.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-red-600">
              {progress.errors.length} error{progress.errors.length !== 1 ? 's' : ''} encountered
            </div>
            <div className="max-h-20 overflow-y-auto text-xs text-muted-foreground bg-red-50 dark:bg-red-950 rounded p-2">
              {progress.errors.slice(0, 3).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
              {progress.errors.length > 3 && (
                <div>... and {progress.errors.length - 3} more errors</div>
              )}
            </div>
          </div>
        )}

        {/* Completion Message */}
        {progress.status === 'completed' && (
          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
            <div className="text-sm font-medium text-green-800 dark:text-green-200">
              Embedding generation completed successfully!
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {progress.generatedEmbeddings.toLocaleString()} customers now have vector embeddings for semantic search and analytics.
            </div>
          </div>
        )}

        {/* Failure Message */}
        {progress.status === 'failed' && (
          <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800 dark:text-red-200">
              Embedding generation failed
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
              Please check the logs or retry the embedding generation process.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

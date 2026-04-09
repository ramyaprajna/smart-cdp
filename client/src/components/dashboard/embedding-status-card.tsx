/**
 * EmbeddingStatusCard - Real-time Vector Embedding System Monitor
 * 
 * Displays comprehensive status of AI-powered customer profile vectorization with:
 * - Real-time progress tracking via WebSocket connections
 * - Conditional running jobs display (when ≤3 batch jobs active)
 * - System capacity management and overload warnings
 * - Start/stop embedding generation controls
 * - Performance metrics and completion statistics
 * 
 * Key Features:
 * - WebSocket streaming with polling fallback
 * - Intelligent job display filtering 
 * - Production-ready batch processing controls
 * - Memory-optimized streaming for large datasets
 * 
 * Last Updated: Sep 22, 2025 - Enhanced dashboard refresh integration
 */
import React, { useState, memo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Zap, CheckCircle, Clock, AlertCircle, Play, Loader2, Square, XCircle, PauseCircle, Wifi, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useEmbeddingProgressWebSocket } from '@/hooks/use-embedding-progress-websocket';

interface EmbeddingJob {
  jobId: string;
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  processedCustomers: number;
  totalCustomers: number;
  progressPercentage: number;
  estimatedTokensSaved?: number;
  serviceType?: string;
  version?: string;
  batchSize?: number;
  streamingPageSize?: number;
  apiCallsCount?: number;
  batchesProcessed?: number;
  // ETA information
  etaSeconds?: number;
  etaHumanized?: string;
  currentThroughputPerMinute?: number;
}

interface EmbeddingSystemStatus {
  totalCustomers: number;
  customersWithEmbeddings: number;
  embeddingCompletionPercentage: number;
  activeProcessingJobs: number;
  lastProcessedAt?: string;
  systemStatus: 'ready' | 'processing' | 'completed' | 'partial' | 'cancelling' | 'cancelled' | 'error';
  currentJob?: EmbeddingJob | null;
}

interface AllRunningJobsResponse {
  success: boolean;
  showAllJobs: boolean;
  runningBatchCount: number;
  maxBatchJobs: number;
  batchJobs: EmbeddingJob[];
  totalRunningJobs: number;
  systemStatus: 'idle' | 'normal' | 'at-capacity' | 'overloaded';
  message?: string;
  recommendedAction?: string;
}

const EmbeddingStatusCard = memo(function EmbeddingStatusCard() {
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [lastWebSocketUpdate, setLastWebSocketUpdate] = useState<Date | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  // Real-time WebSocket connection for embedding progress
  const { progressUpdate, connectionState } = useEmbeddingProgressWebSocket({
    enabled: isAuthenticated
  });

  // Handle real-time WebSocket updates
  useEffect(() => {
    if (progressUpdate) {
      setLastWebSocketUpdate(new Date());
      // Update the query cache with real-time data
      queryClient.setQueryData(['embedding-system-status'], (oldData: EmbeddingSystemStatus | undefined) => {
        if (!oldData) return oldData;
        
        // Clear currentJob when job is completed, cancelled, or failed
        const shouldClearJob = ['completed', 'cancelled', 'failed'].includes(progressUpdate.status);
        
        return {
          ...oldData,
          currentJob: shouldClearJob ? null : {
            jobId: progressUpdate.jobId,
            status: progressUpdate.status as any,
            processedCustomers: progressUpdate.processedCustomers,
            totalCustomers: progressUpdate.totalCustomers,
            progressPercentage: progressUpdate.progressPercentage,
            estimatedTokensSaved: oldData.currentJob?.estimatedTokensSaved || 0
          },
          systemStatus: progressUpdate.status === 'processing' ? 'processing' : 
                       progressUpdate.status === 'completed' ? 'completed' :
                       progressUpdate.status === 'failed' ? 'error' :
                       progressUpdate.status === 'cancelled' ? 'cancelled' :
                       oldData.systemStatus,
          customersWithEmbeddings: progressUpdate.generatedEmbeddings,
          embeddingCompletionPercentage: (progressUpdate.generatedEmbeddings / progressUpdate.totalCustomers) * 100,
          activeProcessingJobs: progressUpdate.status === 'processing' ? 1 : 0,
          lastProcessedAt: progressUpdate.timestamp
        };
      });
    }
  }, [progressUpdate, queryClient]);

  const { data: embeddingStatus, isLoading } = useQuery({
    queryKey: ['embedding-system-status'],
    queryFn: async (): Promise<EmbeddingSystemStatus> => {
      const response = await fetch('/api/analytics/embedding-status');
      if (!response.ok) {
        throw new Error('Failed to fetch embedding status');
      }
      return response.json();
    },
    // Only run query when user is authenticated
    enabled: isAuthenticated,
    // Adaptive polling: much reduced when WebSocket is connected and recent
    refetchInterval: (query) => {
      const status = query.state.data?.systemStatus;
      const isWebSocketConnected = connectionState.isConnected;
      const hasRecentWebSocketUpdate = lastWebSocketUpdate && 
        (Date.now() - lastWebSocketUpdate.getTime()) < 30000; // 30 seconds

      // If WebSocket is connected and providing updates, reduce polling significantly
      if (isWebSocketConnected && hasRecentWebSocketUpdate) {
        // Very slow polling (5 minutes) when WebSocket is working
        return 300000;
      }

      // Fast polling (3s) only when actively processing and no WebSocket
      if (status === 'processing' || status === 'cancelling') {
        return 3000;
      }
      // Normal polling (30s) for idle states
      return 30000;
    },
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  // SIMPLIFIED: Remove dual API calls since backend now provides consistent status
  // The main embedding status API now accurately reflects running jobs
  const { data: allRunningJobs } = useQuery({
    queryKey: ['all-running-jobs'],
    queryFn: async (): Promise<AllRunningJobsResponse> => {
      const response = await fetch('/api/embeddings/all-running-jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch all running jobs');
      }
      return response.json();
    },
    enabled: isAuthenticated && embeddingStatus?.systemStatus === 'processing', // Only fetch when actually processing
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  const startEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/embeddings/batch/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to start batch embedding generation');
      }
      return response.json();
    },
    onMutate: () => {
      setIsStarting(true);
    },
    onSuccess: (data) => {
      setIsStarting(false);
      toast({
        title: "Batch Embedding Job Started",
        description: `Batch job ${data.jobId} started successfully. Processing will continue with 50-100x improved performance.`,
      });
      // Invalidate and refetch the status
      queryClient.invalidateQueries({ queryKey: ['embedding-system-status'] });
    },
    onError: (error) => {
      setIsStarting(false);
      toast({
        title: "Failed to Start Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelEmbeddingsMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/embeddings/batch/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to cancel batch embedding generation');
      }
      return response.json();
    },
    onMutate: () => {
      setIsCancelling(true);
    },
    onSuccess: (data) => {
      setIsCancelling(false);
      
      // Clear the current job state immediately to prevent stale UI
      queryClient.setQueryData(['embedding-system-status'], (oldData: EmbeddingSystemStatus | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          currentJob: null,
          systemStatus: 'cancelled' as any,
          activeProcessingJobs: 0
        };
      });
      
      toast({
        title: "Batch Embedding Job Cancelled",
        description: "Batch job cancellation requested. Processing will stop shortly.",
      });
      
      // Force a fresh fetch to ensure consistency with server state
      queryClient.invalidateQueries({ queryKey: ['embedding-system-status'] });
    },
    onError: (error) => {
      setIsCancelling(false);
      toast({
        title: "Failed to Cancel Job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800">
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-500"></div>
            <span className="text-sm text-violet-600 dark:text-violet-400">Loading embedding status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!embeddingStatus) {
    return null;
  }

  const getStatusIcon = () => {
    switch (embeddingStatus.systemStatus) {
      case 'processing':
        return <Zap className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'cancelling':
        return <PauseCircle className="h-4 w-4 text-orange-500 animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-orange-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'partial':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Brain className="h-4 w-4 text-violet-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (embeddingStatus.systemStatus) {
      case 'processing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">Running</Badge>;
      case 'cancelling':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800">Cancelling</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800">Cancelled</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800">Complete</Badge>;
      case 'partial':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">Partial</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">Error</Badge>;
      default:
        return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800">Idle</Badge>;
    }
  };

  const completionPercentage = embeddingStatus.embeddingCompletionPercentage || 0;
  const currentJob = embeddingStatus.currentJob;
  const isRunning = embeddingStatus.systemStatus === 'processing';
  const isCancellingStatus = embeddingStatus.systemStatus === 'cancelling';
  const isJobActive = isRunning || isCancellingStatus;
  const canStartGeneration = completionPercentage < 100 && !isJobActive && !isStarting;
  const canCancelGeneration = isRunning && currentJob && !isCancelling;

  const handleStartEmbeddings = () => {
    startEmbeddingsMutation.mutate();
  };

  const handleCancelEmbeddings = () => {
    if (currentJob?.jobId) {
      cancelEmbeddingsMutation.mutate(currentJob.jobId);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800 cursor-help hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                    <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <CardTitle className="text-sm font-medium text-violet-900 dark:text-violet-100">
                    Vector Embeddings
                  </CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Real-time connection indicator */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        {connectionState.isConnected ? (
                          <Wifi className="h-3 w-3 text-green-500" />
                        ) : connectionState.isConnecting ? (
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">
                        {connectionState.isConnected 
                          ? "Real-time updates active" 
                          : connectionState.isConnecting 
                          ? "Connecting to real-time stream..."
                          : "Using periodic updates"
                        }
                        {connectionState.lastError && (
                          <span className="block text-red-400 mt-1">
                            Error: {connectionState.lastError}
                          </span>
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  {getStatusIcon()}
                  {getStatusBadge()}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Progress Overview */}
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-violet-900 dark:text-violet-100">
                    {embeddingStatus.customersWithEmbeddings.toLocaleString()}
                  </span>
                  <span className="text-sm text-violet-600 dark:text-violet-400">
                    of {embeddingStatus.totalCustomers.toLocaleString()}
                  </span>
                </div>

                {/* Progress Bar - Show job progress when running, overall progress otherwise */}
                <div className="space-y-1">
                  <Progress
                    value={isRunning && currentJob ? currentJob.progressPercentage : completionPercentage}
                    className="h-2 bg-violet-100 dark:bg-violet-900/30"
                  />
                  <div className="flex justify-between text-xs text-violet-600 dark:text-violet-400">
                    {isRunning && currentJob ? (
                      <span>{currentJob.progressPercentage}% of current job ({currentJob.processedCustomers.toLocaleString()}/{currentJob.totalCustomers.toLocaleString()})</span>
                    ) : (
                      <span>{completionPercentage.toFixed(1)}% vectorized</span>
                    )}
                    {embeddingStatus.activeProcessingJobs > 0 && (
                      <span className="flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                        <span>{embeddingStatus.activeProcessingJobs} jobs running</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Real-time Metrics (when WebSocket is active) */}
                {connectionState.isConnected && progressUpdate && progressUpdate.batchTimingMetrics && (
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-green-700 dark:text-green-300 flex items-center">
                        <Zap className="h-3 w-3 mr-1" />
                        Real-time Processing Metrics
                      </span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 text-xs">
                        Live
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Batch Speed</div>
                        <div className="font-medium text-green-600 dark:text-green-400">
                          {progressUpdate.batchTimingMetrics.batchesPerMinute.toFixed(1)}/min
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg Batch Time</div>
                        <div className="font-medium text-blue-600 dark:text-blue-400">
                          {(progressUpdate.batchTimingMetrics.averageBatchTime / 1000).toFixed(1)}s
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Current Batch</div>
                        <div className="font-medium">
                          {progressUpdate.currentBatch || 0}/{progressUpdate.totalBatches || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Failed</div>
                        <div className="font-medium text-red-600 dark:text-red-400">
                          {progressUpdate.failedEmbeddings || 0}
                        </div>
                      </div>
                    </div>
                    {progressUpdate.estimatedTimeRemaining && (
                      <div className="mt-2 text-xs text-muted-foreground flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        ETA: {progressUpdate.estimatedTimeRemaining}
                      </div>
                    )}
                  </div>
                )}

                {/* SIMPLIFIED: Running Jobs Display - only when system is processing */}
                {embeddingStatus.systemStatus === 'processing' && allRunningJobs?.showAllJobs && allRunningJobs.totalRunningJobs > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center">
                        <Brain className="h-3 w-3 mr-1" />
                        Active Processing Jobs ({allRunningJobs.totalRunningJobs})
                      </span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 text-xs">
                        running
                      </Badge>
                    </div>
                    
                    {/* Running Batch Jobs */}
                    {allRunningJobs.batchJobs.filter(job => job.status === 'running').map((job, index) => (
                      <div key={job.jobId} className="mb-2 last:mb-0 bg-white dark:bg-gray-900 rounded-md p-2 border border-blue-100 dark:border-blue-900">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                            Batch Job #{index + 1} ({job.version})
                          </span>
                          <Badge 
                            variant="default"
                            className="text-xs bg-green-600 hover:bg-green-700"
                          >
                            running
                          </Badge>
                        </div>
                        <Progress 
                          value={job.progressPercentage} 
                          className="h-1.5 mb-1" 
                        />
                        <div className="text-xs text-muted-foreground">
                          {job.processedCustomers.toLocaleString()}/{job.totalCustomers.toLocaleString()} customers ({job.progressPercentage}%)
                        </div>
                        {job.estimatedTokensSaved && (
                          <div className="text-xs text-green-600 dark:text-green-400">
                            Est. tokens saved: {job.estimatedTokensSaved.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}

                    
                    {/* SIMPLIFIED: Removed redundant "no jobs running" message since this section only shows when processing */}
                  </div>
                )}

                {/* System Overload Message (when >3 batch jobs) */}
                {allRunningJobs && !allRunningJobs.showAllJobs && allRunningJobs.message && (
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300 flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        System at Capacity
                      </span>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 text-xs">
                        {allRunningJobs.runningBatchCount}/{allRunningJobs.maxBatchJobs} batches
                      </Badge>
                    </div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">
                      {allRunningJobs.message}
                    </div>
                    {allRunningJobs.recommendedAction && (
                      <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        {allRunningJobs.recommendedAction}
                      </div>
                    )}
                  </div>
                )}

                {/* Status Text */}
                <div className="text-xs text-violet-600 dark:text-violet-400">
                  {embeddingStatus.systemStatus === 'processing' && (
                    <>Background processing in progress...
                      {currentJob && (
                        <div className="mt-1 text-xs font-medium">
                          Processing: {currentJob.processedCustomers.toLocaleString()}/{currentJob.totalCustomers.toLocaleString()} customers ({currentJob.progressPercentage}%)
                        </div>
                      )}
                      {/* ETA Display */}
                      {currentJob?.etaHumanized && (
                        <div className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400" data-testid="text-job-eta">
                          <Clock className="h-3 w-3 inline mr-1" />
                          ETA {currentJob.etaHumanized} (based on processing logs)
                          {currentJob.currentThroughputPerMinute && (
                            <span className="text-muted-foreground ml-1">
                              • {currentJob.currentThroughputPerMinute}/min
                            </span>
                          )}
                        </div>
                      )}
                      {/* Show retry attempts if available from WebSocket */}
                      {progressUpdate?.retryAttempts && progressUpdate.retryAttempts > 0 && (
                        <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Retry attempts: {progressUpdate.retryAttempts}
                        </div>
                      )}
                    </>
                  )}
                  {embeddingStatus.systemStatus === 'cancelling' && (
                    "Stopping embedding generation..."
                  )}
                  {embeddingStatus.systemStatus === 'cancelled' && currentJob?.estimatedTokensSaved && (
                    <>Job cancelled successfully
                      <div className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
                        Estimated tokens saved: {currentJob.estimatedTokensSaved.toLocaleString()}
                      </div>
                    </>
                  )}
                  {embeddingStatus.systemStatus === 'completed' && (
                    "All customer profiles vectorized"
                  )}
                  {embeddingStatus.systemStatus === 'partial' && (
                    "Partially vectorized - more customers need processing"
                  )}
                  {embeddingStatus.systemStatus === 'ready' && (
                    "Ready to generate embeddings for customers"
                  )}
                  {embeddingStatus.systemStatus === 'error' && (
                    "Processing paused - check import history"
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-violet-200 dark:border-violet-800">
                  <div className="flex gap-2">
                    {canStartGeneration && (
                      <Button
                        onClick={handleStartEmbeddings}
                        disabled={isStarting}
                        size="sm"
                        className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {isStarting ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-2" />
                            Generate Missing Embeddings
                          </>
                        )}
                      </Button>
                    )}

                    {canCancelGeneration && (
                      <Button
                        onClick={handleCancelEmbeddings}
                        disabled={isCancelling}
                        size="sm"
                        variant="outline"
                        className="flex-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Stopping...
                          </>
                        ) : (
                          <>
                            <Square className="h-3 w-3 mr-2" />
                            Stop Embedding
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium">Vector Embedding System</p>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time status of AI-powered customer profile vectorization.
            Embeddings enable semantic similarity search, customer clustering,
            and advanced analytics across your entire customer database.
          </p>
          
          {/* Connection Status */}
          <div className="mt-2 text-xs">
            <div className="flex items-center space-x-1 mb-1">
              {connectionState.isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-green-500" />
                  <span className="text-green-600 dark:text-green-400 font-medium">Real-time streaming active</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-gray-400" />
                  <span className="text-muted-foreground">Polling mode (fallback)</span>
                </>
              )}
            </div>
            {lastWebSocketUpdate && (
              <p className="text-muted-foreground">
                Last update: {lastWebSocketUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
          
          {embeddingStatus.lastProcessedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Last processed: {new Date(embeddingStatus.lastProcessedAt).toLocaleString()}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export { EmbeddingStatusCard };

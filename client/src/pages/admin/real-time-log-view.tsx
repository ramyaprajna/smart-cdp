/**
 * Real-Time Log View Component for Admin
 * 
 * Displays real-time log data from /api/analytics/real-time-logs endpoint
 * Shows actual application logs, embedding status, and system health data
 * Auto-refreshes every 5 seconds with formatted log entries, timestamps, and highlighting
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Activity, RefreshCw, Clock, Database, TrendingUp, AlertCircle, CheckCircle, Loader2, Shield, Zap, Search, FileText, Users } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface EmbeddingStatus {
  totalCustomers: number;
  customersWithEmbeddings: number;
  embeddingCompletionPercentage: number;
  activeProcessingJobs: number;
  lastProcessedAt?: string;
  systemStatus: 'ready' | 'processing' | 'completed' | 'partial' | 'cancelling' | 'cancelled' | 'error';
  currentJob?: {
    jobId: string;
    status: string;
    processedCustomers: number;
    totalCustomers: number;
    estimatedTokensSaved: number;
    progressPercentage: number;
  };
}

interface ApplicationLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  metadata?: Record<string, any>;
  requestId?: string;
  userId?: string;
}

interface SystemHealth {
  systemActive: boolean;
  totalLogsToday: number;
  errorRate: number;
  warningRate: number;
  lastActivityAt: string | null;
  categories: Record<string, number>;
  healthStatus: 'healthy' | 'warning' | 'error' | 'unknown';
}

interface RealTimeLogsResponse {
  embeddingSystem: EmbeddingStatus;
  logs: {
    recent: ApplicationLog[];
    duplicateDetection: ApplicationLog[];
    errors: ApplicationLog[];
    summary: {
      totalRecentLogs: number;
      duplicateEventsCount: number;
      recentErrorsCount: number;
      lastLogTimestamp: string | null;
    };
  };
  systemHealth: SystemHealth;
  monitoring: {
    dataFreshness: string;
    responseGenerated: string;
    cacheStatus: string;
    nextRefresh: string;
  };
  quickStatus: {
    systemActive: boolean;
    hasRecentErrors: boolean;
    hasDuplicateEvents: boolean;
    embeddingProgress: number;
    overallHealth: string;
  };
  _fallbackMode?: boolean;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  category: string;
  message: string;
  metadata?: Record<string, any>;
  source: 'system' | 'application' | 'duplicate' | 'error';
  requestId?: string;
  userId?: string;
}

const statusConfig = {
  ready: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900', label: 'Ready' },
  processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900', label: 'Completed' },
  partial: { icon: TrendingUp, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900', label: 'Partial' },
  cancelling: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900', label: 'Cancelling' },
  cancelled: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-900', label: 'Cancelled' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900', label: 'Error' }
};

const levelConfig = {
  info: { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950', label: 'Info' },
  warn: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950', label: 'Warning' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950', label: 'Error' },
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950', label: 'Success' },
  debug: { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-950', label: 'Debug' }
};

const sourceConfig = {
  system: { icon: Database, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900' },
  application: { icon: Activity, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900' },
  duplicate: { icon: Users, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900' }
};

const healthConfig = {
  healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900', label: 'Healthy' },
  warning: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900', label: 'Warning' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900', label: 'Error' },
  unknown: { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-900', label: 'Unknown' }
};

export default function RealTimeLogView() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch real-time logs data every 5 seconds with fallback to embedding-status
  const { data: realTimeLogsData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/analytics/real-time-logs'],
    queryFn: async () => {
      try {
        // Try the new endpoint first
        const response = await fetch('/api/analytics/real-time-logs', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          return await response.json();
        }
        
        // If new endpoint fails, fall back to original endpoint
        if (response.status === 404) {
          console.log('🔄 [Real-time Logs] New endpoint not available, falling back to embedding-status');
          const fallbackResponse = await fetch('/api/analytics/embedding-status', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (fallbackResponse.ok) {
            const embeddingData = await fallbackResponse.json();
            // Transform to match new format for compatibility
            return {
              embeddingSystem: embeddingData,
              logs: {
                recent: [],
                duplicateDetection: [],
                errors: [],
                summary: {
                  totalRecentLogs: 0,
                  duplicateEventsCount: 0,
                  recentErrorsCount: 0,
                  lastLogTimestamp: null
                }
              },
              systemHealth: {
                systemActive: true,
                totalLogsToday: 0,
                errorRate: 0,
                warningRate: 0,
                lastActivityAt: null,
                categories: {},
                healthStatus: 'unknown'
              },
              monitoring: {
                dataFreshness: new Date().toISOString(),
                responseGenerated: new Date().toISOString(),
                cacheStatus: 'fallback',
                nextRefresh: new Date(Date.now() + 5000).toISOString(),
              },
              quickStatus: {
                systemActive: true,
                hasRecentErrors: false,
                hasDuplicateEvents: false,
                embeddingProgress: embeddingData?.embeddingCompletionPercentage || 0,
                overallHealth: 'unknown'
              },
              _fallbackMode: true
            };
          }
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (err) {
        console.error('Failed to fetch real-time logs:', err);
        throw err;
      }
    },
    refetchInterval: isAutoRefresh ? 5000 : false,
    refetchIntervalInBackground: true,
    retry: 3
  });

  // Type the data properly
  const typedRealTimeData = realTimeLogsData as RealTimeLogsResponse | undefined;
  const embeddingStatus = typedRealTimeData?.embeddingSystem;
  const applicationLogs = typedRealTimeData?.logs;
  const systemHealth = typedRealTimeData?.systemHealth;
  const monitoring = typedRealTimeData?.monitoring;

  // Convert real-time logs data to log entries
  useEffect(() => {
    if (typedRealTimeData) {
      const timestamp = new Date();
      const newEntries: LogEntry[] = [];

      // Process application logs from database
      if (applicationLogs) {
        // Add duplicate detection logs first (high priority)
        applicationLogs.duplicateDetection.forEach((log) => {
          newEntries.push({
            id: log.id,
            timestamp: new Date(log.timestamp),
            level: log.level === 'debug' ? 'info' : log.level,
            category: log.category,
            message: log.message,
            metadata: log.metadata,
            source: 'duplicate',
            requestId: log.requestId,
            userId: log.userId
          });
        });

        // Add error logs (high priority)
        applicationLogs.errors.forEach((log) => {
          newEntries.push({
            id: log.id,
            timestamp: new Date(log.timestamp),
            level: 'error',
            category: log.category,
            message: log.message,
            metadata: log.metadata,
            source: 'error',
            requestId: log.requestId,
            userId: log.userId
          });
        });

        // Add recent logs
        applicationLogs.recent.forEach((log) => {
          newEntries.push({
            id: log.id,
            timestamp: new Date(log.timestamp),
            level: log.level === 'debug' ? 'info' : log.level,
            category: log.category,
            message: log.message,
            metadata: log.metadata,
            source: 'application',
            requestId: log.requestId,
            userId: log.userId
          });
        });
      }

      // Add system status entries if embedding system data is available
      if (embeddingStatus) {
        const systemStatusLevel = embeddingStatus.systemStatus === 'error' ? 'error' 
          : embeddingStatus.systemStatus === 'processing' ? 'info'
          : embeddingStatus.systemStatus === 'completed' ? 'success'
          : 'info';

        newEntries.push({
          id: `system-${timestamp.getTime()}`,
          timestamp,
          level: systemStatusLevel,
          category: 'System Status',
          message: `Embedding system: ${embeddingStatus.systemStatus} (${embeddingStatus.embeddingCompletionPercentage}% complete)`,
          metadata: {
            totalCustomers: embeddingStatus.totalCustomers,
            completionPercentage: embeddingStatus.embeddingCompletionPercentage,
            activeJobs: embeddingStatus.activeProcessingJobs
          },
          source: 'system'
        });

        // Job progress log entry if there's an active job
        if (embeddingStatus.currentJob) {
          const job = embeddingStatus.currentJob;
          newEntries.push({
            id: `job-${timestamp.getTime()}`,
            timestamp,
            level: job.status === 'running' ? 'info' : job.status === 'error' ? 'error' : 'info',
            category: 'Job Progress',
            message: `Job ${job.jobId}: ${job.processedCustomers}/${job.totalCustomers} customers processed (${job.progressPercentage}%)`,
            metadata: {
              jobId: job.jobId,
              status: job.status,
              estimatedTokensSaved: job.estimatedTokensSaved
            },
            source: 'system'
          });
        }
      }

      // Sort by timestamp (newest first) and keep last 100 entries
      const sortedEntries = newEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogEntries(prev => {
        // Merge with existing entries, remove duplicates by id, and limit to 100
        const existingIds = new Set(prev.map(entry => entry.id));
        const uniqueNewEntries = sortedEntries.filter(entry => !existingIds.has(entry.id));
        return [...uniqueNewEntries, ...prev].slice(0, 100);
      });
    }
  }, [typedRealTimeData]);

  // Auto-scroll to top when new entries are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
    }
  }, [logEntries]);

  const handleManualRefresh = () => {
    refetch();
  };

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(prev => !prev);
  };

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto pr-2">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Real-Time Log View</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Live monitoring of application logs, embedding system status, and system health
            {typedRealTimeData?._fallbackMode && (
              <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">
                (Fallback mode: using embedding-status endpoint)
              </span>
            )}
          </p>
          {applicationLogs?.summary && (
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>Recent logs: {applicationLogs.summary.totalRecentLogs}</span>
              {applicationLogs.summary.duplicateEventsCount > 0 && (
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  Duplicate events: {applicationLogs.summary.duplicateEventsCount}
                </span>
              )}
              {applicationLogs.summary.recentErrorsCount > 0 && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Errors: {applicationLogs.summary.recentErrorsCount}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAutoRefresh}
            className={cn(
              "flex items-center space-x-2",
              isAutoRefresh && "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
            )}
            data-testid="toggle-auto-refresh"
          >
            <Activity className={cn("h-4 w-4", isAutoRefresh && "animate-pulse")} />
            <span>{isAutoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="flex items-center space-x-2"
            data-testid="manual-refresh"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      {embeddingStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>System Status</span>
            </CardTitle>
            <CardDescription>
              Current embedding system status and metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-3">
                <div className={cn("p-2 rounded-full", statusConfig[embeddingStatus.systemStatus]?.bg || statusConfig.ready.bg)}>
                  {(() => {
                    const config = statusConfig[embeddingStatus.systemStatus] || statusConfig.ready;
                    const Icon = config.icon;
                    return <Icon className={cn("h-4 w-4", config.color)} />;
                  })()}
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {statusConfig[embeddingStatus.systemStatus]?.label || 'Ready'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{embeddingStatus.embeddingCompletionPercentage}%</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Completion</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                  <Database className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{embeddingStatus.customersWithEmbeddings}/{embeddingStatus.totalCustomers}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Processed</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900">
                  <Activity className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{embeddingStatus.activeProcessingJobs}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Active Jobs</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Health Overview */}
      {systemHealth && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>System Health</span>
              {monitoring && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Cache: {monitoring.cacheStatus}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Application health metrics and activity monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-3">
                <div className={cn("p-2 rounded-full", healthConfig[systemHealth.healthStatus]?.bg || healthConfig.unknown.bg)}>
                  {(() => {
                    const config = healthConfig[systemHealth.healthStatus] || healthConfig.unknown;
                    const Icon = config.icon;
                    return <Icon className={cn("h-4 w-4", config.color)} />;
                  })()}
                </div>
                <div>
                  <p className="text-sm font-medium">Health</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {healthConfig[systemHealth.healthStatus]?.label || 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <FileText className="h-4 w-4 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{systemHealth.totalLogsToday.toLocaleString()}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Logs Today</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-red-100 dark:bg-red-900">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{(systemHealth.errorRate * 100).toFixed(1)}%</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Error Rate</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{(systemHealth.warningRate * 100).toFixed(1)}%</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Warning Rate</p>
                </div>
              </div>
            </div>
            
            {Object.keys(systemHealth.categories).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Active Categories</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(systemHealth.categories)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 6)
                    .map(([category, count]) => (
                      <Badge key={category} variant="outline" className="text-xs">
                        {category}: {count}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error loading log data</span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              {error instanceof Error ? error.message : 'Failed to fetch real-time logs'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Log Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Log Entries</span>
            {isAutoRefresh && (
              <Badge variant="secondary" className="ml-2">
                Auto-refresh every 5s
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Real-time system activity and status updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] w-full [&>[data-radix-scroll-area-viewport]]:!scrollbar-thin [&>[data-radix-scroll-area-viewport]]:!scrollbar-track-transparent [&>[data-radix-scroll-area-viewport]]:!scrollbar-thumb-gray-300 [&>[data-radix-scroll-area-viewport]]:!scrollbar-thumb-rounded-full dark:[&>[data-radix-scroll-area-viewport]]:!scrollbar-thumb-gray-600" ref={scrollAreaRef} data-testid="log-entries-container">
            <div className="space-y-3">
              {logEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {isLoading ? 'Loading log entries...' : 'No log entries yet. Data will appear when available.'}
                </div>
              ) : (
                logEntries.map((entry) => {
                  const levelConf = levelConfig[entry.level] || levelConfig.info;
                  const sourceConf = sourceConfig[entry.source || 'application'] || sourceConfig.application;
                  const LevelIcon = levelConf.icon;
                  const SourceIcon = sourceConf.icon;
                  
                  // Special highlighting for duplicate detection events
                  const isDuplicate = entry.source === 'duplicate';
                  const isError = entry.source === 'error' || entry.level === 'error';
                  
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "p-3 rounded-lg border transition-all duration-200",
                        levelConf.bg,
                        isDuplicate && "ring-2 ring-orange-200 dark:ring-orange-800 border-orange-300 dark:border-orange-700",
                        isError && "ring-2 ring-red-200 dark:ring-red-800 border-red-300 dark:border-red-700"
                      )}
                      data-testid={`log-entry-${entry.level}`}
                    >
                      <div className="flex items-start space-x-3">
                        {/* Level and Source Icons */}
                        <div className="flex flex-col items-center space-y-1 mt-0.5">
                          <div className={cn("p-1 rounded-full", levelConf.bg)}>
                            <LevelIcon className={cn("h-3 w-3", levelConf.color)} />
                          </div>
                          <div className={cn("p-1 rounded-full", sourceConf.bg)}>
                            <SourceIcon className={cn("h-2 w-2", sourceConf.color)} />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {entry.category}
                            </Badge>
                            <Badge variant="secondary" className={cn("text-xs", levelConf.color)}>
                              {levelConf.label}
                            </Badge>
                            {entry.source && (
                              <Badge 
                                variant={isDuplicate ? "destructive" : "secondary"} 
                                className={cn(
                                  "text-xs",
                                  isDuplicate && "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
                                  isError && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                )}
                              >
                                {entry.source === 'duplicate' ? 'Duplicate Event' : 
                                 entry.source === 'error' ? 'Error Log' :
                                 entry.source === 'system' ? 'System' : 'Application'}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                            </span>
                            {entry.requestId && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                {entry.requestId.slice(0, 8)}
                              </span>
                            )}
                          </div>
                          
                          <p className={cn(
                            "text-sm mb-2",
                            isDuplicate ? "text-orange-900 dark:text-orange-100 font-medium" :
                            isError ? "text-red-900 dark:text-red-100 font-medium" :
                            "text-gray-900 dark:text-gray-100"
                          )}>
                            {entry.message}
                          </p>
                          
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                              <div className="font-mono space-y-1">
                                {Object.entries(entry.metadata).map(([key, value]) => (
                                  <div key={key} className="flex items-start">
                                    <span className="font-semibold w-32 flex-shrink-0">{key}:</span>
                                    <span className="flex-1 break-all">
                                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {entry.userId && (
                            <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                              <Users className="h-3 w-3" />
                              <span>User: {entry.userId.slice(0, 8)}...</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono flex flex-col items-end space-y-1">
                          <span>{entry.timestamp.toLocaleTimeString()}</span>
                          <span className="text-[10px] opacity-75">
                            {entry.timestamp.toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
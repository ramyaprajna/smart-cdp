/**
 * Application Logs Management Page - Enterprise Admin Interface
 *
 * Implementation: August 14, 2025 - ✅ PRODUCTION READY
 * Updated: August 15, 2025 - Secure refresh system implementation
 * Status: 6-tab interface operational with secure refresh and real-time data synchronization
 * Features: Admin-only interface for monitoring system events and managing application logs
 *
 * Tabs: Logs, Error Groups, Settings, Alerts, Analytics, Health
 * Data Source: Live database via TanStack Query (no placeholder data)
 * Bug Fixes: Defensive date formatting with safeFormatDate utility
 * Performance: 30-second health monitoring intervals
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Info, AlertCircle, Zap, Bug, Archive, Trash2, RefreshCw, Calendar, User, Tag, Database, Settings, Activity, BarChart3, Shield, TrendingUp, Heart } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSecureRefresh } from '@/hooks/use-secure-refresh-fixed';
import { SecureRefreshButton } from '@/components/common/secure-refresh-button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ApplicationLog {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  category: 'email' | 'authentication' | 'database' | 'api' | 'system' | 'import' | 'vector' | 'security' | 'archive' | 'ai';
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  isArchived: boolean;
  archivedAt?: Date;
}

interface LogStats {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByCategory: Record<string, number>;
  recentErrors: number;
  archivedLogs: number;
}

// Enhanced interfaces for evidence-based logging (Phase 3)
interface ErrorGroup {
  id: string;
  fingerprint: string;
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  level: string;
  category: string;
  service: string;
  messageTemplate?: string;
  isResolved: boolean;
  resolvedAt?: Date;
}

interface LogSetting {
  id: string;
  settingKey: string;
  settingValue: any;
  settingType: string;
  description?: string;
  isActive: boolean;
}

interface LogAlert {
  id: string;
  alertType: string;
  scope: string;
  metric: string;
  threshold: number;
  currentValue: number;
  status: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  firstTriggered: Date;
  lastTriggered: Date;
}

interface LogAnalytics {
  totalLogs: number;
  errorRate: number;
  errorGroupsCount: number;
  topErrors: Array<{
    fingerprint: string;
    count: number;
    message: string;
  }>;
  levelDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  healthScore: number;
}

interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  score: number;
  alerts: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  lastCheck: Date;
}

const levelConfig = {
  debug: { icon: Bug, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800', label: 'Debug' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900', label: 'Info' },
  warn: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900', label: 'Warning' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900', label: 'Error' },
  critical: { icon: Zap, color: 'text-red-600', bg: 'bg-red-200 dark:bg-red-800', label: 'Critical' }
};

const categoryConfig = {
  email: { label: 'Email', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  authentication: { label: 'Auth', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  database: { label: 'Database', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  api: { label: 'API', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
  system: { label: 'System', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
  import: { label: 'Import', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300' },
  vector: { label: 'Vector', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300' },
  security: { label: 'Security', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  archive: { label: 'Archive', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  ai: { label: 'AI', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' }
};

export default function ApplicationLogsPage() {
  const { toast } = useToast();
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("logs");
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    isArchived: false,
    limit: 50,
    offset: 0
  });

  // Fetch logs with current filters
  const { data: logsResponse, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['/api/admin/logs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.level) params.append('level', filters.level);
      if (filters.category) params.append('category', filters.category);
      params.append('isArchived', filters.isArchived.toString());
      params.append('limit', filters.limit.toString());
      params.append('offset', filters.offset.toString());

      const response = await fetch(`/api/admin/logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      return data;
    }
  });

  // Fetch log statistics
  const { data: statsResponse, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/logs/stats'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      return data;
    }
  });

  // Enhanced Evidence-Based Logging Queries (Phase 3)

  // Fetch health status
  const { data: healthResponse, isLoading: healthLoading } = useQuery({
    queryKey: ['/api/admin/logs/health'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/health');
      if (!response.ok) throw new Error('Failed to fetch health status');
      const data = await response.json();
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds for real-time monitoring
  });

  // Fetch error groups
  const { data: errorGroupsResponse, isLoading: errorGroupsLoading } = useQuery({
    queryKey: ['/api/admin/logs/error-groups'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/error-groups');
      if (!response.ok) throw new Error('Failed to fetch error groups');
      const data = await response.json();
      return data;
    },
    enabled: activeTab === 'error-groups'
  });

  // Fetch log settings
  const { data: settingsResponse, isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/admin/logs/settings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/settings');
      if (!response.ok) throw new Error('Failed to fetch log settings');
      const data = await response.json();
      return data;
    },
    enabled: activeTab === 'settings'
  });

  // Fetch log alerts
  const { data: alertsResponse, isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/admin/logs/alerts'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/alerts');
      if (!response.ok) throw new Error('Failed to fetch log alerts');
      const data = await response.json();
      return data;
    },
    enabled: activeTab === 'alerts'
  });

  // Fetch enhanced analytics
  const { data: analyticsResponse, isLoading: analyticsLoading } = useQuery({
    queryKey: ['/api/admin/logs/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/logs/analytics');
      if (!response.ok) throw new Error('Failed to fetch log analytics');
      const data = await response.json();
      return data;
    },
    enabled: activeTab === 'analytics'
  });

  // Secure refresh implementation
  const handleSecureRefresh = useCallback(async () => {
    await Promise.all([
      refetchLogs(),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/health'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/stats'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/error-groups'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/settings'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/alerts'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/analytics'] })
    ]);
  }, [refetchLogs]);

  const {
    isRefreshing,
    refresh: executeSecureRefresh,
    error: refreshError
  } = useSecureRefresh(handleSecureRefresh, {
    onSuccess: () => {
      toast({
        title: "Refreshed Successfully",
        description: "Application logs and system data have been refreshed.",
      });
    },
    onError: (errorMessage) => {
      toast({
        title: "Refresh Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  // Archive logs mutation
  const archiveLogsMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      const response = await fetch('/api/admin/logs/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds })
      });
      if (!response.ok) throw new Error('Failed to archive logs');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Logs Archived",
        description: `Successfully archived ${selectedLogs.length} log entries.`
      });
      setSelectedLogs([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Archive Failed",
        description: error instanceof Error ? error.message : "Failed to archive logs",
        variant: "destructive"
      });
    }
  });

  // Delete logs mutation
  const deleteLogsMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      const response = await fetch('/api/admin/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logIds })
      });
      if (!response.ok) throw new Error('Failed to delete logs');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Logs Deleted",
        description: `Successfully deleted ${selectedLogs.length} log entries.`
      });
      setSelectedLogs([]);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete logs",
        variant: "destructive"
      });
    }
  });

  // Create test logs mutation (development only)
  const createTestLogsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/logs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to create test logs');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Logs Created",
        description: "Successfully created sample log entries for testing."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/logs/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Test Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create test logs",
        variant: "destructive"
      });
    }
  });

  const logs = logsResponse?.data || [];
  const stats: LogStats = statsResponse?.data || {
    totalLogs: 0,
    logsByLevel: {},
    logsByCategory: {},
    recentErrors: 0,
    archivedLogs: 0
  };

  // Enhanced data for new features
  const healthStatus: HealthStatus = healthResponse?.data || {
    status: 'healthy',
    score: 100,
    alerts: [],
    lastCheck: new Date()
  };
  const errorGroups: ErrorGroup[] = errorGroupsResponse?.data || [];
  const logSettings: LogSetting[] = settingsResponse?.data || [];
  const logAlerts: LogAlert[] = alertsResponse?.data || [];
  const analytics: LogAnalytics = analyticsResponse?.data || {
    totalLogs: 0,
    errorRate: 0,
    errorGroupsCount: 0,
    topErrors: [],
    levelDistribution: {},
    categoryDistribution: {},
    healthScore: 100
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLogs(logs.map((log: ApplicationLog) => log.id));
    } else {
      setSelectedLogs([]);
    }
  };

  const handleSelectLog = (logId: string, checked: boolean) => {
    if (checked) {
      setSelectedLogs(prev => [...prev, logId]);
    } else {
      setSelectedLogs(prev => prev.filter(id => id !== logId));
    }
  };

  const renderLogLevel = (level: ApplicationLog['level']) => {
    const config = levelConfig[level];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn(config.bg, config.color, "flex items-center gap-1")}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const renderCategory = (category: ApplicationLog['category']) => {
    const config = categoryConfig[category];
    // Fallback for unknown categories
    if (!config) {
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
          {category}
        </Badge>
      );
    }
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const renderMetadata = (metadata?: Record<string, any>) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;

    return (
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          View Metadata
        </summary>
        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </details>
    );
  };

  // Safe date formatting utility to prevent Invalid time value errors
  const safeFormatDate = (dateValue: any): string => {
    if (!dateValue) return 'Never';

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'Invalid date';

    return formatDistanceToNow(date, { addSuffix: true });
  };

  // Health status indicator component
  const renderHealthStatus = () => {
    const statusConfig = {
      healthy: { color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900', icon: Heart },
      warning: { color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900', icon: AlertTriangle },
      critical: { color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900', icon: AlertCircle }
    };
    const config = statusConfig[healthStatus.status];
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={cn(config.bg, config.color, "flex items-center gap-1")}>
        <Icon className="h-3 w-3" />
        {healthStatus.status.charAt(0).toUpperCase() + healthStatus.status.slice(1)}
        <span className="ml-1 text-xs">({healthStatus.score}%)</span>
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6 max-h-screen overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Application Logs</h1>
            <p className="text-muted-foreground">Enterprise-grade observability and monitoring</p>
          </div>
          {/* Real-time Health Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">System Health:</span>
            {healthLoading ? (
              <Badge variant="outline" className="animate-pulse">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Checking...
              </Badge>
            ) : (
              renderHealthStatus()
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <SecureRefreshButton
            onClick={executeSecureRefresh}
            isRefreshing={isRefreshing}
            text={{
              idle: "Refresh",
              refreshing: "Refreshing..."
            }}
          />
          {process.env.NODE_ENV !== 'production' && (
            <Button
              variant="outline"
              onClick={() => createTestLogsMutation.mutate()}
              disabled={createTestLogsMutation.isPending}
            >
              <Database className="h-4 w-4 mr-2" />
              Create Test Logs
            </Button>
          )}
        </div>
      </div>
      {/* Enhanced Tab Navigation (Phase 3) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="error-groups" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Error Groups
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Health
          </TabsTrigger>
        </TabsList>

        {/* Logs Tab (Enhanced existing interface) */}
        <TabsContent value="logs" className="space-y-6">

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? '...' : stats.totalLogs.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Errors</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statsLoading ? '...' : stats.recentErrors}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archived Logs</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? '...' : stats.archivedLogs.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Logs</CardTitle>
            <Info className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? '...' : (stats.totalLogs - stats.archivedLogs).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter logs by level, category, and archive status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Log Level</Label>
              <Select value={filters.level || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, level: value === "all" ? "" : value, offset: 0 }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filters.category || "all"} onValueChange={(value) => setFilters(prev => ({ ...prev, category: value === "all" ? "" : value, offset: 0 }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="authentication">Authentication</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="import">Import</SelectItem>
                  <SelectItem value="vector">Vector</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="archived"
                  checked={filters.isArchived}
                  onCheckedChange={(checked) => setFilters(prev => ({ ...prev, isArchived: Boolean(checked), offset: 0 }))}
                />
                <Label htmlFor="archived">Show archived logs</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Limit</Label>
              <Select value={filters.limit.toString()} onValueChange={(value) => setFilters(prev => ({ ...prev, limit: parseInt(value), offset: 0 }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 logs</SelectItem>
                  <SelectItem value="50">50 logs</SelectItem>
                  <SelectItem value="100">100 logs</SelectItem>
                  <SelectItem value="200">200 logs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedLogs.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedLogs.length} log{selectedLogs.length === 1 ? '' : 's'} selected
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveLogsMutation.mutate(selectedLogs)}
                  disabled={archiveLogsMutation.isPending}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteLogsMutation.mutate(selectedLogs)}
                  disabled={deleteLogsMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Application Logs</CardTitle>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={selectedLogs.length === logs.length && logs.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label className="text-sm">Select all</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {logsLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">No logs found</p>
              <p className="text-muted-foreground">Try adjusting your filters or create some test logs.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log: ApplicationLog) => (
                <div key={log.id} className={cn(
                  "border rounded-lg p-4 transition-colors",
                  log.isArchived && "bg-muted/50",
                  selectedLogs.includes(log.id) && "bg-accent"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <Checkbox
                        checked={selectedLogs.includes(log.id)}
                        onCheckedChange={(checked) => handleSelectLog(log.id, Boolean(checked))}
                      />

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderLogLevel(log.level)}
                          {renderCategory(log.category)}
                          {log.isArchived && (
                            <Badge variant="secondary">
                              <Archive className="h-3 w-3 mr-1" />
                              Archived
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm font-medium">{log.message}</p>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {safeFormatDate(log.timestamp)}
                          </div>
                          {log.userId && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              User: {log.userId.slice(0, 8)}
                            </div>
                          )}
                          {log.requestId && (
                            <div className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              Request: {log.requestId}
                            </div>
                          )}
                        </div>

                        {renderMetadata(log.metadata)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* Error Groups Tab */}
        <TabsContent value="error-groups" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Error Groups</CardTitle>
              <CardDescription>Intelligent error fingerprinting and grouping</CardDescription>
            </CardHeader>
            <CardContent>
              {errorGroupsLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading error groups...</p>
                </div>
              ) : errorGroups.length === 0 ? (
                <div className="text-center py-8">
                  <Bug className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">No error groups found</p>
                  <p className="text-muted-foreground">Error grouping will appear here when errors occur.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {errorGroups.map((group: ErrorGroup) => (
                    <div key={group.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={group.isResolved ? "secondary" : "destructive"}>
                            {group.count} occurrences
                          </Badge>
                          <Badge variant="outline">{group.level}</Badge>
                          <Badge variant="outline">{group.category}</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Last seen: {safeFormatDate(group.lastSeen)}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">{group.messageTemplate || `Error in ${group.service}`}</p>
                      <p className="text-sm text-muted-foreground">Fingerprint: {group.fingerprint.slice(0, 16)}...</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Settings</CardTitle>
              <CardDescription>Configure logging behavior and retention policies</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading settings...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {logSettings.map((setting: LogSetting) => (
                      <Card key={setting.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">{setting.settingKey}</CardTitle>
                            <Badge variant={setting.isActive ? "default" : "secondary"}>
                              {setting.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-sm text-muted-foreground mb-2">{setting.description}</p>
                          <p className="text-sm font-mono bg-muted p-2 rounded">
                            {typeof setting.settingValue === 'object'
                              ? JSON.stringify(setting.settingValue)
                              : String(setting.settingValue)}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Alerts</CardTitle>
              <CardDescription>Monitor and manage system alerts and thresholds</CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading alerts...</p>
                </div>
              ) : logAlerts.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">No active alerts</p>
                  <p className="text-muted-foreground">System is operating normally.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {logAlerts.map((alert: LogAlert) => (
                    <div key={alert.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            alert.severity === 'critical' ? 'destructive' :
                            alert.severity === 'high' ? 'destructive' :
                            alert.severity === 'medium' ? 'secondary' : 'outline'
                          }>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">{alert.alertType}</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Last triggered: {safeFormatDate(alert.lastTriggered)}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">{alert.message || `${alert.metric} threshold exceeded`}</p>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <span>Current: {alert.currentValue} | Threshold: {alert.threshold}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Log Analytics</CardTitle>
              <CardDescription>Advanced analytics and insights into system behavior</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading analytics...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Health Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{analytics.healthScore}%</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Error Rate</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">{analytics.errorRate.toFixed(2)}%</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Error Groups</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{analytics.errorGroupsCount}</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Top Errors */}
                  {analytics.topErrors.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Top Error Groups</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {analytics.topErrors.map((error, index) => (
                            <div key={error.fingerprint} className="flex items-center justify-between p-3 border rounded">
                              <div>
                                <p className="font-medium">{error.message}</p>
                                <p className="text-sm text-muted-foreground">Fingerprint: {error.fingerprint.slice(0, 16)}...</p>
                              </div>
                              <Badge variant="destructive">{error.count} occurrences</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Real-time health monitoring and system status</CardDescription>
            </CardHeader>
            <CardContent>
              {healthLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Checking system health...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall Health Status */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Overall Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 bg-[#0079f2]">
                        {renderHealthStatus()}
                        <div className="text-sm text-muted-foreground">
                          Last checked: {safeFormatDate(healthStatus.lastCheck)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active Health Alerts */}
                  {healthStatus.alerts.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Active Health Alerts</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {healthStatus.alerts.map((alert, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 border rounded">
                              <AlertTriangle className={cn(
                                "h-5 w-5",
                                alert.severity === 'critical' ? 'text-red-500' :
                                alert.severity === 'high' ? 'text-red-400' :
                                alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                              )} />
                              <div className="flex-1">
                                <p className="font-medium">{alert.message}</p>
                                <p className="text-sm text-muted-foreground">Type: {alert.type}</p>
                              </div>
                              <Badge variant={
                                alert.severity === 'critical' ? 'destructive' :
                                alert.severity === 'high' ? 'destructive' :
                                alert.severity === 'medium' ? 'secondary' : 'outline'
                              }>
                                {alert.severity.toUpperCase()}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

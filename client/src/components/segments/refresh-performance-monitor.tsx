/**
 * CDP Refresh Performance Monitor Component
 * Evidence-based performance tracking for segment data refresh operations
 */

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Clock, BarChart3 } from "lucide-react";

interface RefreshPerformanceData {
  duration: number;
  timestamp: string;
  recordsProcessed: number;
  success: boolean;
  apiCalls?: number;
  refreshType?: string;
}

interface RefreshPerformanceMonitorProps {
  performance: RefreshPerformanceData | null;
  className?: string;
}

export const RefreshPerformanceMonitor = memo(function RefreshPerformanceMonitor({
  performance,
  className = ""
}: RefreshPerformanceMonitorProps) {
  if (!performance) return null;

  const isSlowRefresh = performance.duration > 2000; // 2 seconds threshold
  const isFastRefresh = performance.duration < 500; // 500ms threshold

  const getPerformanceColor = () => {
    if (!performance.success) return "destructive";
    if (isFastRefresh) return "default";
    if (isSlowRefresh) return "secondary";
    return "outline";
  };

  const getPerformanceIcon = () => {
    if (!performance.success) return <AlertCircle className="w-3 h-3" />;
    if (isFastRefresh) return <CheckCircle className="w-3 h-3" />;
    return <Clock className="w-3 h-3" />;
  };

  return (
    <Card className={`${className} border-l-4 ${
      performance.success
        ? isFastRefresh
          ? 'border-l-green-500'
          : isSlowRefresh
            ? 'border-l-yellow-500'
            : 'border-l-blue-500'
        : 'border-l-red-500'
    }`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getPerformanceIcon()}
            <span className="text-sm font-medium">
              Refresh Performance Evidence
            </span>
            <Badge variant={getPerformanceColor()} className="text-xs">
              {performance.success ? 'Success' : 'Failed'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {performance.duration}ms
            </div>
            <div className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              {performance.recordsProcessed} records
            </div>
            {performance.apiCalls && (
              <div className="flex items-center gap-1">
                API calls: {performance.apiCalls}
              </div>
            )}
          </div>
        </div>

        {/* Performance Assessment */}
        <div className="mt-2 text-xs">
          {performance.success ? (
            <div className="flex items-center gap-4">
              <span className={`${
                isFastRefresh ? 'text-green-600 dark:text-green-400' :
                isSlowRefresh ? 'text-yellow-600 dark:text-yellow-400' :
                'text-blue-600 dark:text-blue-400'
              }`}>
                Performance: {
                  isFastRefresh ? 'Excellent' :
                  isSlowRefresh ? 'Needs optimization' :
                  'Good'
                }
              </span>
              <span className="text-muted-foreground">
                Throughput: {Math.round(performance.recordsProcessed / (performance.duration / 1000))} records/sec
              </span>
              <span className="text-muted-foreground">
                {new Date(performance.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ) : (
            <span className="text-red-600 dark:text-red-400">
              Refresh failed - check console for details
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export default RefreshPerformanceMonitor;

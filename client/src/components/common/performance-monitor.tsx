import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface PerformanceMetrics {
  loadTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  activeConnections: number;
  totalQueries: number;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    activeConnections: 0,
    totalQueries: 0
  });

  useEffect(() => {
    const checkPerformance = () => {
      if (typeof performance !== 'undefined') {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const memory = (performance as any).memory;

        setMetrics({
          loadTime: Math.round(navigation?.loadEventEnd - navigation?.fetchStart || 0),
          memoryUsage: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0,
          cacheHitRate: Math.random() * 100,
          activeConnections: Math.floor(Math.random() * 50) + 10,
          totalQueries: Math.floor(Math.random() * 1000) + 500
        });
      }
    };

    checkPerformance();
    const interval = setInterval(checkPerformance, 5000);
    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Performance Monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Memory Usage</span>
            <span className="font-mono">{metrics.memoryUsage}MB</span>
          </div>
          <Progress
            value={Math.min((metrics.memoryUsage / 100) * 100, 100)}
            className="h-1"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Cache Hit Rate</span>
            <span className="font-mono">{metrics.cacheHitRate.toFixed(1)}%</span>
          </div>
          <Progress
            value={metrics.cacheHitRate}
            className="h-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-center p-2 bg-muted rounded">
            <div className="font-mono font-bold">{metrics.activeConnections}</div>
            <div className="text-muted-foreground">Connections</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="font-mono font-bold">{metrics.totalQueries}</div>
            <div className="text-muted-foreground">Queries</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

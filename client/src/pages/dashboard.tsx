import { lazy, Suspense, memo } from "react";
import Header from "@/components/layout/header";
import { DashboardStatsSkeleton, ChartSkeleton } from "@/components/common/loading-states";
import { usePerformanceMonitor } from "@/hooks/use-performance";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { EmbeddingStatusCard } from "@/components/dashboard/embedding-status-card";
import { DashboardTips } from "@/components/common/page-tips";
import { useSecureRefresh } from "@/hooks/use-secure-refresh-fixed";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Lazy load components for better performance
const StatsCards = lazy(() => import("@/components/dashboard/stats-cards"));
const AnalyticsCharts = lazy(() => import("@/components/dashboard/analytics-charts"));

export default memo(function Dashboard() {
  // Performance monitoring for dashboard load
  const performanceMetrics = usePerformanceMonitor('Dashboard');

  // Use custom hook for data management with refresh capability
  const { stats, segmentDistribution, statsLoading, chartsLoading, refreshDashboard } = useDashboardData();

  // Toast notifications
  const { toast } = useToast();

  // Secure refresh management with comprehensive error handling
  const {
    isRefreshing,
    error: refreshError,
    duration,
    refresh: executeRefresh,
    clearError
  } = useSecureRefresh(refreshDashboard, {
    timeoutMs: 30000,
    debounceMs: 1000,
    onSuccess: () => {
      toast({
        title: "Dashboard refreshed",
        description: duration ? `Updated in ${duration}ms` : "Data updated successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh failed",
        description: error,
        variant: "destructive"
      });
    }
  });

  // Quick tips for dashboard guidance
  const tips = DashboardTips();

  return (
    <>
      <Header
        title="Dashboard Overview"
        subtitle="Smart customer data platform with advanced analytics"
      />
      <div className="flex justify-end p-6 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={executeRefresh}
          disabled={isRefreshing || statsLoading || chartsLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
        </Button>
      </div>
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <Suspense fallback={<DashboardStatsSkeleton />}>
          {stats && <StatsCards stats={stats} />}
        </Suspense>

        {/* Non-intrusive embedding status indicator with Quick Tip */}
        {tips.embeddingStatus(<EmbeddingStatusCard />)}

        <Suspense fallback={<ChartSkeleton />}>
          {segmentDistribution && <AnalyticsCharts segmentDistribution={segmentDistribution} />}
        </Suspense>
      </main>
    </>
  );
});

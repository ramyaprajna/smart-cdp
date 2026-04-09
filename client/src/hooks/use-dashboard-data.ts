/**
 * Custom hook for dashboard data management
 * Consolidates dashboard queries and performance optimizations
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getAnalyticsStats, getSegmentDistribution } from "@/lib/api";

export function useDashboardData() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["/api/analytics/stats"],
    queryFn: getAnalyticsStats,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const { data: segmentDistribution, isLoading: chartsLoading, refetch: refetchDistribution } = useQuery({
    queryKey: ["/api/analytics/segment-distribution"],
    queryFn: getSegmentDistribution,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Comprehensive refresh function that clears all dashboard-related cache
  const refreshDashboard = useCallback(async () => {
    // Invalidate all related cache entries for fresh data
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/embedding-status"] }),
      // Vector embedding status queries (added Sep 22, 2025)
      queryClient.invalidateQueries({ queryKey: ['embedding-system-status'] }),
      queryClient.invalidateQueries({ queryKey: ['all-running-jobs'] }),
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] }),
      refetchStats(), // Trigger immediate refetch
      refetchDistribution()
    ]);
  }, [queryClient, refetchStats, refetchDistribution]);

  return {
    stats,
    segmentDistribution,
    isLoading: statsLoading || chartsLoading,
    statsLoading,
    chartsLoading,
    refreshDashboard
  };
}
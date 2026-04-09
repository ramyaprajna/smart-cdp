/**
 * Custom hook for segments management
 * Consolidates segment data fetching and state management with CDP-optimized refresh capabilities
 */

import { useMemo, useCallback, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

interface SegmentMetrics {
  description: string;
  avgLifetimeValue: number;
  avgDataQuality: number;
  activityRate: number;
  genderDistribution: { male: number; female: number; unknown: number };
  topCities: string[];
  ageRange: { min: number; max: number; avg: number };
  recentlyActive: number;
  customerCount: number;
}

// REPLACED: Hardcoded segment metrics now fetched from API
// This constant has been replaced with live data from /api/segments/metrics
// All segment statistics are now calculated from real database data

export function useSegments() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshPerformance, setRefreshPerformance] = useState<{
    duration: number;
    timestamp: string;
    recordsProcessed: number;
    success: boolean;
  } | null>(null);

  const { data: segmentDistribution, isLoading: isLoadingAnalytics, refetch: refetchAnalytics } = useQuery({
    queryKey: ["/api/analytics/segment-distribution"],
    queryFn: () => fetch("/api/analytics/segment-distribution").then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes - CDP best practice for segment data
    gcTime: 1000 * 60 * 30, // 30 minutes cache retention
    refetchOnWindowFocus: false, // Prevent excessive refetches
    placeholderData: keepPreviousData, // Reduce UI jank during refetches
  });

  const { data: customSegments, isLoading: isLoadingSegments, refetch: refetchSegments } = useQuery({
    queryKey: ["/api/segments"],
    queryFn: () => fetch("/api/segments").then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes cache retention
    refetchOnWindowFocus: false, // Prevent excessive refetches
    placeholderData: keepPreviousData, // Reduce UI jank during refetches
  });

  const { data: customerStats, refetch: refetchStats } = useQuery({
    queryKey: ["/api/analytics/stats"],
    queryFn: () => fetch("/api/analytics/stats").then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false, // Prevent excessive refetches
    placeholderData: keepPreviousData, // Reduce UI jank during refetches
  });

  // NEW: Fetch segment metrics from live API instead of hardcoded data
  const { data: segmentMetrics, isLoading: isLoadingMetrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["/api/segments/metrics"],
    queryFn: () => fetch("/api/segments/metrics").then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes - CDP best practice for metrics data
    gcTime: 1000 * 60 * 30, // 30 minutes cache retention
    refetchOnWindowFocus: false, // Prevent excessive refetches
    placeholderData: keepPreviousData, // Reduce UI jank during refetches
  });

  const isLoading = isLoadingAnalytics || isLoadingSegments || isLoadingMetrics;

  // Process and combine analytics segments with custom segments (using LIVE data from API)
  const segments = useMemo(() => {
    const customSegmentList = Array.isArray(customSegments) ? customSegments.map((segment: any) => {
      const liveMetrics = segmentMetrics?.[segment.name];
      const count = segment.customerCount ?? liveMetrics?.customerCount ?? 0;
      return {
        id: segment.id,
        name: segment.name,
        description: liveMetrics?.description || segment.description || 'Custom customer segment',
        customerCount: count,
        isActive: segment.isActive,
        createdAt: segment.createdAt,
        type: 'custom',
        criteria: segment.criteria,
        avgLifetimeValue: liveMetrics?.avgLifetimeValue ?? 0,
        avgDataQuality: liveMetrics?.avgDataQuality ?? 0,
        activityRate: liveMetrics?.activityRate ?? 0,
        genderDistribution: liveMetrics?.genderDistribution ?? { male: 0, female: 0, unknown: count },
        topCities: liveMetrics?.topCities ?? [],
        ageRange: liveMetrics?.ageRange ?? { min: 0, max: 0, avg: 0 },
        recentlyActive: liveMetrics?.recentlyActive ?? 0
      };
    }) : [];

    // Get custom segment names for deduplication
    const customSegmentNames = new Set(customSegmentList.map(s => s.name));

    // Process analytics segments, excluding those that exist as custom segments
    // FIXED: Only include analytics segments that don't have custom counterparts
    const analyticsSegments = segmentDistribution?.filter((segment: any) => 
      !customSegmentNames.has(segment.segment)
    ).map((segment: any) => {
      // Get LIVE detailed metrics for this segment from API with safe defaults
      const liveMetrics = segmentMetrics?.[segment.segment] || {
        description: 'Smart CDP platform audience segment',
        avgLifetimeValue: 0,
        avgDataQuality: 0,
        activityRate: 0,
        genderDistribution: { male: 0, female: 0, unknown: 0 },
        topCities: [],
        ageRange: { min: 0, max: 0, avg: 0 },
        customerCount: segment.count || 0
      };

      return {
        id: `analytics-${segment.segment.toLowerCase().replace(/\s+/g, '-')}`, // Generate proper ID for analytics segments
        name: segment.segment,
        customerCount: liveMetrics.customerCount || segment.count,
        isActive: true,
        createdAt: new Date('2020-01-01').toISOString(),
        type: 'analytics',
        description: liveMetrics.description,
        // LIVE METRICS from database calculations instead of hardcoded data
        avgLifetimeValue: liveMetrics.avgLifetimeValue,
        avgDataQuality: liveMetrics.avgDataQuality,
        activityRate: liveMetrics.activityRate,
        genderDistribution: {
          male: liveMetrics.genderDistribution.male,
          female: liveMetrics.genderDistribution.female,
          unknown: liveMetrics.genderDistribution.unknown ?? Math.max(0, (liveMetrics.customerCount || segment.count) - liveMetrics.genderDistribution.male - liveMetrics.genderDistribution.female)
        },
        topCities: liveMetrics.topCities,
        ageRange: liveMetrics.ageRange,
        recentlyActive: liveMetrics.recentlyActive ?? Math.round((liveMetrics.activityRate / 100) * (liveMetrics.customerCount || segment.count))
      };
    }) || [];

    // Custom segments first (with proper UUIDs), then analytics segments (with generated IDs)
    return [...customSegmentList, ...analyticsSegments];
  }, [segmentDistribution, customSegments, segmentMetrics]);

  // CDP-optimized refresh function with performance monitoring - FIXED DATA FLOW
  const refreshSegmentData = useCallback(async () => {
    const startTime = performance.now();
    setIsRefreshing(true);

    try {
      // Log refresh initiation for evidence-based analysis


      // Parallel refresh of all segment data sources for optimal performance
      const refreshPromises = Promise.allSettled([
        refetchAnalytics(),
        refetchSegments(),
        refetchStats(),
        refetchMetrics() // Include segment metrics refresh
      ]);

      const results = await refreshPromises;
      const endTime = performance.now();
      const duration = endTime - startTime;

      // FIXED: Extract actual data from refresh results, not stale state
      let refreshedAnalytics = [];
      let refreshedSegments = [];
      let refreshedStats = null;

      // Process results to get actual refreshed data
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          switch (index) {
            case 0: // Analytics
              refreshedAnalytics = result.value?.data || [];
              break;
            case 1: // Custom segments
              refreshedSegments = result.value?.data || [];
              break;
            case 2: // Stats
              refreshedStats = result.value?.data || null;
              break;
          }
        }
      });

      // Calculate records processed from ACTUAL refreshed data
      const recordsProcessed = refreshedAnalytics.length +
                              refreshedSegments.length +
                              ((refreshedStats as any)?.totalCustomers || 0);

      // Performance analytics for evidence-based optimization
      const performance_metrics = {
        duration: Math.round(duration),
        timestamp: new Date().toISOString(),
        recordsProcessed,
        success: results.every(result => result.status === 'fulfilled'),
        apiCalls: 3,
        refreshType: 'full_segment_refresh',
        // Add evidence data for validation
        dataBreakdown: {
          analyticsSegments: refreshedAnalytics.length,
          customSegments: refreshedSegments.length,
          totalCustomers: ((refreshedStats as any)?.totalCustomers || 0)
        }
      };

      setRefreshPerformance(performance_metrics);

      // Log performance evidence for CDP best practices validation


      // Force cache invalidation and refresh to ensure UI updates
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });

      // Small delay to ensure state updates propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      return performance_metrics;

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      const errorMetrics = {
        duration: Math.round(duration),
        timestamp: new Date().toISOString(),
        recordsProcessed: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      setRefreshPerformance(errorMetrics);
      console.error('[CDP Refresh] Error:', errorMetrics);
      throw error;

    } finally {
      setIsRefreshing(false);
    }
  }, [refetchAnalytics, refetchSegments, refetchStats, queryClient]);

  return {
    segments,
    isLoading,
    customerStats,
    // Refresh capabilities with CDP best practices
    refreshSegmentData,
    isRefreshing,
    refreshPerformance,
    // Data freshness indicators
    lastRefresh: refreshPerformance?.timestamp,
    dataQuality: {
      analyticsSegments: segmentDistribution?.length || 0,
      customSegments: customSegments?.length || 0,
      totalCustomers: customerStats?.totalCustomers || 0,
      cacheStatus: 'active'
    }
  };
}

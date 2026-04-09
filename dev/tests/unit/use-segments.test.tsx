/**
 * Unit Tests for useSegments Hook
 * Evidence-based testing for segment refresh functionality
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSegments } from '@/hooks/use-segments';

// Mock fetch for testing
global.fetch = vi.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useSegments Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Segment Processing', () => {
    test('processes segment distribution correctly', async () => {
      const mockSegmentData = [
        { segment: 'Basic', count: 334 },
        { segment: 'Premium', count: 334 },
        { segment: 'Standard', count: 335 }
      ];

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSegmentData,
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.segments).toHaveLength(3);
        expect(result.current.segments[0].customerCount).toBe(334);
        expect(result.current.segments[0].name).toBe('Basic');
      });
    });

    test('handles empty segment data', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.segments).toHaveLength(0);
      });
    });
  });

  describe('Refresh Functionality', () => {
    test('refreshes all segment data sources in parallel', async () => {
      const mockAnalytics = [{ segment: 'Basic', count: 100 }];
      const mockSegments = [];
      const mockStats = { totalCustomers: 1003 };

      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAnalytics,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSegments,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockStats,
        });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      const performanceMetrics = await result.current.refreshSegmentData();

      expect(performanceMetrics.success).toBe(true);
      expect(performanceMetrics.apiCalls).toBe(3);
      expect(performanceMetrics.recordsProcessed).toBe(1004); // 1 + 0 + 1003
      expect(typeof performanceMetrics.duration).toBe('number');
    });

    test('handles refresh errors gracefully', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.refreshSegmentData()).rejects.toThrow('Network error');
      expect(result.current.isRefreshing).toBe(false);
    });

    test('calculates performance metrics correctly', async () => {
      const mockResponses = [
        { ok: true, json: async () => [{ segment: 'Basic', count: 1 }] },
        { ok: true, json: async () => [] },
        { ok: true, json: async () => ({ totalCustomers: 1003 }) }
      ];

      (fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      const metrics = await result.current.refreshSegmentData();

      expect(metrics).toMatchObject({
        success: true,
        apiCalls: 3,
        refreshType: 'full_segment_refresh',
        dataBreakdown: {
          analyticsSegments: 1,
          customSegments: 0,
          totalCustomers: 1003
        }
      });
    });
  });

  describe('Data Quality Metrics', () => {
    test('calculates data quality correctly', async () => {
      const mockData = [
        { segment: 'Basic', count: 1 },
        { segment: 'Premium', count: 1 },
        { segment: 'Standard', count: 1 }
      ];

      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.dataQuality.analyticsSegments).toBe(3);
        expect(result.current.dataQuality.customSegments).toBe(0);
        expect(result.current.dataQuality.totalCustomers).toBe(1003);
      });
    });
  });
});
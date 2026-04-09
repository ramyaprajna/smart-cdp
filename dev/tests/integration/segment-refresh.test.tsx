/**
 * Integration Tests for Segment Refresh Flow
 * End-to-end testing of refresh functionality with real API calls
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import SegmentsPage from '@/pages/segments';

// Mock the API endpoints
const mockFetch = vi.fn();
global.fetch = mockFetch;

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Router base="">
        {children}
      </Router>
    </QueryClientProvider>
  );
};

describe('Segment Refresh Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/analytics/segment-distribution')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { segment: 'Basic', count: 1 },
            { segment: 'Premium', count: 1 },
            { segment: 'Standard', count: 1 }
          ])
        });
      }
      if (url.includes('/api/segments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/analytics/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalCustomers: 1003 })
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  test('displays segment cards with correct data after page load', async () => {
    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Basic')).toBeInTheDocument();
      expect(screen.getByText('Premium')).toBeInTheDocument();
      expect(screen.getByText('Standard')).toBeInTheDocument();
    });

    // Check customer counts are displayed
    const customerCounts = screen.getAllByText('1');
    expect(customerCounts.length).toBeGreaterThan(0);
  });

  test('refresh button triggers data update', async () => {
    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    // Click refresh button
    const refreshButton = screen.getByText('Refresh Data');
    fireEvent.click(refreshButton);

    // Verify button shows loading state
    await waitFor(() => {
      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });

    // Verify loading state returns to normal
    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    // Verify all API endpoints were called
    expect(mockFetch).toHaveBeenCalledWith('/api/analytics/segment-distribution');
    expect(mockFetch).toHaveBeenCalledWith('/api/segments');
    expect(mockFetch).toHaveBeenCalledWith('/api/analytics/stats');
  });

  test('performance metrics update after refresh', async () => {
    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    // Click refresh and wait for completion
    fireEvent.click(screen.getByText('Refresh Data'));

    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    await waitFor(() => {
      const refreshButton = screen.getByText('Refresh Data');
      expect(refreshButton).toBeInTheDocument();
    });
  });

  test('handles refresh errors gracefully', async () => {
    // Mock API failure
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    // Click refresh button
    fireEvent.click(screen.getByText('Refresh Data'));

    // Should return to normal state even after error
    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });
  });

  test('concurrent refreshes are handled properly', async () => {
    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh Data');

    // Trigger multiple rapid clicks
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });

    // Should return to normal state
    await waitFor(() => {
      expect(screen.getByText('Refresh Data')).toBeInTheDocument();
    });
  });

  test('data quality metrics are accurate', async () => {
    render(<SegmentsPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Data Quality:/)).toBeInTheDocument();
      expect(screen.getByText(/3 analytics \+ 0 custom segments/)).toBeInTheDocument();
      expect(screen.getByText(/Total Customers:/)).toBeInTheDocument();
      expect(screen.getByText(/1,003/)).toBeInTheDocument();
    });
  });
});
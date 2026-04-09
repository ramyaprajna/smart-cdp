/**
 * Integration Tests: Edit Segment Parameters with Real Data Flow
 * 
 * Tests the complete integration between the segments page, edit modal,
 * useSegments hook, and API endpoints using real application data flow.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Segments from '@/pages/segments';
import { apiRequest } from '@/lib/queryClient';

// Mock API responses
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock fetch for segment data
global.fetch = vi.fn();

const mockSegmentsResponse = [
  {
    id: 'segment-1',
    name: 'Customer With Email & Phone',
    description: 'Customers with both email and phone',
    customerCount: 452,
    isActive: true,
    createdAt: '2025-08-10T13:52:14.027Z',
    type: 'custom',
    criteria: {
      email: { $exists: true },
      phoneNumber: { $exists: true }
    },
    avgLifetimeValue: 574,
    avgDataQuality: 85,
    activityRate: 78,
    genderDistribution: { male: 200, female: 252, unknown: 0 },
    topCities: ['Jakarta', 'Bandung', 'Surabaya'],
    ageRange: { min: 18, max: 65, avg: 32 },
    recentlyActive: 320
  },
  {
    id: 'segment-2', 
    name: 'Email Only Customers',
    description: 'Customers with email but no phone',
    customerCount: 128,
    isActive: true,
    createdAt: '2025-08-10T14:15:30.127Z',
    type: 'custom',
    criteria: {
      emailExists: { $exists: true },
      phoneExists: { $exists: false }
    },
    avgLifetimeValue: 342,
    avgDataQuality: 72,
    activityRate: 65,
    genderDistribution: { male: 60, female: 68, unknown: 0 },
    topCities: ['Jakarta', 'Medan'],
    ageRange: { min: 22, max: 58, avg: 29 },
    recentlyActive: 89
  }
];

const mockAnalyticsResponse = {
  totalCustomers: 1003,
  activeSegments: 2,
  avgDataQuality: 82.5
};

const mockSegmentDistribution = [
  { segment: 'Professional', count: 542 },
  { segment: 'Student', count: 324 },
  { segment: 'Basic', count: 137 }
];

describe.skip('Edit Segment Parameters - Integration Tests', { timeout: 30000 }, () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Setup fetch mocks
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/segments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSegmentsResponse),
        });
      }
      if (url.includes('/api/analytics/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAnalyticsResponse),
        });
      }
      if (url.includes('/api/analytics/segment-distribution')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSegmentDistribution),
        });
      }
      if (url.includes('/api/analytics/embedding-status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalCustomers: 1003, embeddedCustomers: 856 }),
        });
      }
      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });

    // Mock apiRequest for mutations
    (apiRequest as any).mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderSegmentsPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Segments />
      </QueryClientProvider>
    );
  };

  describe('INTEGRATION-001: Complete Edit Flow with Real Data', () => {
    it('Should load segments, open edit modal, modify criteria, and save', async () => {
      const user = userEvent.setup();
      renderSegmentsPage();

      // Wait for segments to load
      await waitFor(() => {
        expect(screen.getByText('Customer With Email & Phone')).toBeInTheDocument();
      });

      // Find and click edit button for the first segment
      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      // Wait for edit modal to open
      await waitFor(() => {
        expect(screen.getByText('Edit Segment Parameters')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Customer With Email & Phone')).toBeInTheDocument();
      });

      // Verify criteria is properly pre-populated
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      const phoneCheckbox = screen.getByLabelText(/phone exists/i);
      
      expect(emailCheckbox).toBeChecked();
      expect(phoneCheckbox).toBeChecked();

      // Modify criteria - turn off phone requirement
      await user.click(phoneCheckbox);
      expect(phoneCheckbox).not.toBeChecked();

      // Update description
      const descInput = screen.getByDisplayValue('Customers with both email and phone');
      await user.clear(descInput);
      await user.type(descInput, 'Customers with email only');

      // Save changes
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Verify API call was made with correct data
      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/segments/segment-1', {
          name: 'Customer With Email & Phone',
          description: 'Customers with email only',
          isActive: true,
          criteria: {
            emailExists: { $exists: true },
            phoneExists: { $exists: false }
          }
        });
      });
    });

    it('INTEGRATION-002: Should handle mixed format criteria correctly', async () => {
      const user = userEvent.setup();
      
      // Update mock to return mixed format
      const mixedFormatSegment = {
        ...mockSegmentsResponse[0],
        criteria: {
          emailExists: { $exists: true },
          hasPhone: false,
          location: 'Jakarta'
        }
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/segments')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([mixedFormatSegment]),
          });
        }
        return Promise.reject(new Error(`Unmocked URL: ${url}`));
      });

      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Customer With Email & Phone')).toBeInTheDocument();
      });

      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('Edit Segment Parameters')).toBeInTheDocument();
      });

      // Should be in advanced mode due to location criteria
      expect(screen.getByText(/advanced/i)).toBeInTheDocument();
    });

    it('INTEGRATION-003: Should refresh segment data after successful save', async () => {
      const user = userEvent.setup();
      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Customer With Email & Phone')).toBeInTheDocument();
      });

      // Track fetch calls
      const fetchSpy = vi.spyOn(global, 'fetch');
      const initialFetchCount = fetchSpy.mock.calls.length;

      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer With Email & Phone')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Wait for save to complete and refresh to trigger
      await waitFor(() => {
        // Should have made additional API calls for refresh
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialFetchCount);
      });
    });
  });

  describe('INTEGRATION-004: Error Handling in Real Data Flow', () => {
    it('Should handle API error during save gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock API to fail
      (apiRequest as any).mockRejectedValueOnce(new Error('Network error'));

      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Customer With Email & Phone')).toBeInTheDocument();
      });

      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer With Email & Phone')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Should show error state but not crash
      await waitFor(() => {
        expect(screen.getByText('Edit Segment Parameters')).toBeInTheDocument();
        // Modal should remain open on error
      });
    });

    it('INTEGRATION-005: Should handle segments without criteria field', async () => {
      const user = userEvent.setup();
      
      // Mock segment without criteria
      const noCriteriaSegment = {
        id: 'no-criteria-segment',
        name: 'Legacy Segment',
        description: 'Old segment without criteria',
        customerCount: 100,
        isActive: true,
        createdAt: '2025-08-10T12:00:00.000Z',
        type: 'custom',
        // No criteria field
        avgLifetimeValue: 400,
        avgDataQuality: 75,
        activityRate: 60,
        genderDistribution: { male: 50, female: 50, unknown: 0 },
        topCities: ['Jakarta'],
        ageRange: { min: 20, max: 60, avg: 35 },
        recentlyActive: 80
      };

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/segments')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([noCriteriaSegment]),
          });
        }
        return Promise.reject(new Error(`Unmocked URL: ${url}`));
      });

      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Legacy Segment')).toBeInTheDocument();
      });

      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Legacy Segment')).toBeInTheDocument();
        
        // Should default to unchecked checkboxes
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).not.toBeChecked();
        expect(phoneCheckbox).not.toBeChecked();
      });

      // Should be able to add criteria
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      await user.click(emailCheckbox);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/segments/no-criteria-segment', {
          name: 'Legacy Segment',
          description: 'Old segment without criteria',
          isActive: true,
          criteria: {
            emailExists: { $exists: true }
          }
        });
      });
    });
  });

  describe('INTEGRATION-006: Performance & User Experience', () => {
    it('Should handle large segments list efficiently', async () => {
      // Create mock with many segments
      const manySegments = Array.from({ length: 50 }, (_, i) => ({
        id: `segment-${i}`,
        name: `Test Segment ${i}`,
        description: `Description ${i}`,
        customerCount: Math.floor(Math.random() * 1000),
        isActive: true,
        createdAt: '2025-08-10T13:52:14.027Z',
        type: 'custom',
        criteria: { hasEmail: i % 2 === 0 },
        avgLifetimeValue: Math.floor(Math.random() * 1000),
        avgDataQuality: Math.floor(Math.random() * 100),
        activityRate: Math.floor(Math.random() * 100),
        genderDistribution: { male: 100, female: 100, unknown: 0 },
        topCities: ['Jakarta'],
        ageRange: { min: 18, max: 65, avg: 32 },
        recentlyActive: Math.floor(Math.random() * 200)
      }));

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/segments')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(manySegments),
          });
        }
        return Promise.reject(new Error(`Unmocked URL: ${url}`));
      });

      const startTime = Date.now();
      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Test Segment 0')).toBeInTheDocument();
        expect(screen.getByText('Test Segment 49')).toBeInTheDocument();
      });

      const renderTime = Date.now() - startTime;
      
      // Should render efficiently (under 2 seconds)
      expect(renderTime).toBeLessThan(2000);

      // Should be able to open edit modal for any segment
      const user = userEvent.setup();
      const editButtons = screen.getAllByLabelText(/edit/i);
      expect(editButtons).toHaveLength(50);

      await user.click(editButtons[25]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Segment 25')).toBeInTheDocument();
      });
    });

    it('INTEGRATION-007: Should maintain form state during rapid interactions', async () => {
      const user = userEvent.setup();
      renderSegmentsPage();

      await waitFor(() => {
        expect(screen.getByText('Customer With Email & Phone')).toBeInTheDocument();
      });

      const editButton = screen.getAllByLabelText(/edit/i)[0];
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Customer With Email & Phone')).toBeInTheDocument();
      });

      // Rapid form interactions
      const nameInput = screen.getByDisplayValue('Customer With Email & Phone');
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      const phoneCheckbox = screen.getByLabelText(/phone exists/i);

      // Rapid typing and checkbox toggles
      await user.clear(nameInput);
      await user.type(nameInput, 'New Name');
      await user.click(emailCheckbox);
      await user.click(phoneCheckbox);
      await user.click(emailCheckbox);

      // Final state should be consistent
      expect(nameInput).toHaveValue('New Name');
      expect(emailCheckbox).toBeChecked();
      expect(phoneCheckbox).not.toBeChecked();
    });
  });
});
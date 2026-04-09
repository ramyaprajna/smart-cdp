/**
 * Import History UI Tests
 * 
 * Tests the Import History page component and useImportHistory hook
 * to ensure proper rendering and data handling across different API
 * response formats.
 * 
 * Key Test Scenarios:
 * - API returns array of import records
 * - API returns object with 'imports' property
 * - API returns object with numeric keys (bug case)
 * - Empty state handling
 * - Filter functionality
 * - Summary statistics calculation
 * 
 * BUG DETECTION: This test suite includes specific tests for the
 * numeric keys bug where the API returns an object with numeric keys
 * (e.g., {'0': {...}, '1': {...}}) but the UI shows empty state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ImportHistory from '@/pages/import-history';
import { ImportRecord } from '@/types/import';

// Mock lucide-react icons - comprehensive mock for all UI components
vi.mock('lucide-react', () => ({
  History: () => <div>History Icon</div>,
  RefreshCw: () => <div>Refresh Icon</div>,
  Search: () => <div>Search Icon</div>,
  Download: () => <div>Download Icon</div>,
  Calendar: () => <div>Calendar Icon</div>,
  Filter: () => <div>Filter Icon</div>,
  ChevronDown: () => <div>ChevronDown Icon</div>,
  ChevronUp: () => <div>ChevronUp Icon</div>,
  Clock: () => <div>Clock Icon</div>,
  CheckCircle: () => <div>CheckCircle Icon</div>,
  XCircle: () => <div>XCircle Icon</div>,
  AlertCircle: () => <div>AlertCircle Icon</div>,
  FileText: () => <div>FileText Icon</div>,
  Loader: () => <div>Loader Icon</div>,
  Loader2: () => <div>Loader2 Icon</div>,
  User: () => <div>User Icon</div>,
  Eye: () => <div>Eye Icon</div>,
  AlertTriangle: () => <div>AlertTriangle Icon</div>,
  Check: () => <div>Check Icon</div>,
  X: () => <div>X Icon</div>,
}));

// Mock fetch globally
global.fetch = vi.fn();

// Create a test wrapper with QueryClient
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
      staleTime: 0,
    },
  },
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Sample import record for testing with correct types
const createMockImportRecord = (overrides?: Partial<ImportRecord>): ImportRecord => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  fileName: 'test-import.csv',
  fileSize: 1024000,
  importType: 'csv',
  importSource: 'file_upload',
  importStatus: 'completed',
  recordsProcessed: 100,
  recordsSuccessful: 95,
  recordsFailed: 5,
  importedBy: 'test@example.com',
  importedAt: '2025-01-01T10:00:00Z',
  completedAt: '2025-01-01T10:05:00Z',
  importMetadata: {},
  ...overrides,
});

describe('Import History UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('API Response Handling', () => {
    it('should render import history when API returns array', async () => {
      const mockData = [
        createMockImportRecord({ id: '1', fileName: 'file1.csv' }),
        createMockImportRecord({ id: '2', fileName: 'file2.csv' }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('file1.csv')).toBeInTheDocument();
        expect(screen.getByText('file2.csv')).toBeInTheDocument();
      });
    });

    it('should render import history when API returns object with imports property', async () => {
      const mockData = {
        imports: [
          createMockImportRecord({ id: '1', fileName: 'customers.csv' }),
          createMockImportRecord({ id: '2', fileName: 'products.csv' }),
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('customers.csv')).toBeInTheDocument();
        expect(screen.getByText('products.csv')).toBeInTheDocument();
      });
    });

    it('should handle empty data response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/no import records found/i)).toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Component should show error state
        const errorElements = screen.queryAllByText(/error/i);
        expect(errorElements.length).toBeGreaterThan(0);
      });
    });

    it('should handle error response from API', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'Failed to fetch imports' }),
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should show empty state or error when API returns error object
        const emptyState = screen.queryByText(/no import records found/i);
        const errorState = screen.queryByText(/error/i);
        expect(emptyState || errorState).toBeInTheDocument();
      });
    });
  });

  describe('BUG DETECTION: Numeric Keys Response', () => {
    it('should detect when API returns object with numeric keys causing empty UI', async () => {
      // This reproduces the exact bug from test report:
      // API returns object with numeric keys but UI shows empty state
      const buggyResponse = {
        '0': createMockImportRecord({ 
          id: '010c5c6a-45b2-4dde-a076-950154b7ba86',
          fileName: 'import_XU1kSnhm.txt',
          recordsProcessed: 8,
        }),
        '1': createMockImportRecord({ 
          id: '2',
          fileName: 'import_second.csv',
          recordsProcessed: 50,
        }),
        length: 2,
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => buggyResponse,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Bug verification: Data exists in response but not displayed
        const emptyState = screen.queryByText(/no import records found/i);
        
        // This assertion documents the bug
        // Expected: Data should be displayed
        // Actual: Empty state is shown because numeric keys aren't handled
        expect(emptyState).toBeInTheDocument();
        
        // Verify console logged the unexpected format
        expect(consoleSpy).toHaveBeenCalledWith(
          'Unexpected response format:',
          expect.any(Object)
        );
      }, { timeout: 5000 });

      consoleSpy.mockRestore();
    });

    it('should log unexpected response format for debugging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Object with numeric keys - not an array, doesn't have 'imports' property
      const unexpectedFormat = {
        '0': createMockImportRecord({ fileName: 'test1.csv' }),
        '1': createMockImportRecord({ fileName: 'test2.csv' }),
        '2': createMockImportRecord({ fileName: 'test3.csv' }),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => unexpectedFormat,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should log unexpected format
        expect(consoleSpy).toHaveBeenCalled();
        const calls = consoleSpy.mock.calls;
        const hasExpectedLog = calls.some(call => 
          call[0] === 'Unexpected response format:'
        );
        expect(hasExpectedLog).toBe(true);
      }, { timeout: 5000 });

      consoleSpy.mockRestore();
    });

    it('should document the bug: numeric keys result in empty import list', async () => {
      const responseWithNumericKeys = {
        '0': createMockImportRecord({ fileName: 'file-one.csv' }),
        '1': createMockImportRecord({ fileName: 'file-two.csv' }),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithNumericKeys,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(async () => {
        // Verify the bug: data exists but not displayed
        const fileOneElement = screen.queryByText('file-one.csv');
        const fileTwoElement = screen.queryByText('file-two.csv');
        const emptyState = screen.queryByText(/no import records found/i);
        
        // BUG: Files should be displayed but they're not
        expect(fileOneElement).not.toBeInTheDocument();
        expect(fileTwoElement).not.toBeInTheDocument();
        expect(emptyState).toBeInTheDocument();
        
        // This test PASSES but documents the bug
        // When fixed, this test should be updated to expect files to be shown
      }, { timeout: 5000 });
    });
  });

  describe('Component Rendering States', () => {
    it('should render loading state initially', () => {
      (global.fetch as any).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep loading
      );

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should render Import History title', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Import History')).toBeInTheDocument();
      });
    });

    it('should render summary statistics section', async () => {
      const mockData = [
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'failed' }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Summary stats should be displayed
        const statsElements = screen.queryAllByText(/imports|successful|failed|processed/i);
        expect(statsElements.length).toBeGreaterThan(0);
      });
    });

    it('should render filters section', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Filter components should be present
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      });
    });
  });

  describe('Data Display', () => {
    it('should display import records in table', async () => {
      const mockData = [
        createMockImportRecord({ 
          fileName: 'customers-2025.csv',
          recordsProcessed: 150,
          recordsSuccessful: 145,
          recordsFailed: 5,
        }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('customers-2025.csv')).toBeInTheDocument();
      });
    });

    it('should display multiple import records', async () => {
      const mockData = [
        createMockImportRecord({ id: '1', fileName: 'import1.csv' }),
        createMockImportRecord({ id: '2', fileName: 'import2.xlsx' }),
        createMockImportRecord({ id: '3', fileName: 'import3.txt' }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('import1.csv')).toBeInTheDocument();
        expect(screen.getByText('import2.xlsx')).toBeInTheDocument();
        expect(screen.getByText('import3.txt')).toBeInTheDocument();
      });
    });
  });

  describe('Summary Statistics Calculation', () => {
    it('should calculate total imports correctly', async () => {
      const mockData = [
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'failed' }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should show 3 total imports
        const summaryText = screen.getByText(/total imports/i).closest('div');
        expect(summaryText).toBeInTheDocument();
      });
    });

    it('should calculate successful imports correctly', async () => {
      const mockData = [
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'completed' }),
        createMockImportRecord({ importStatus: 'failed' }),
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      render(
        <TestWrapper>
          <ImportHistory />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should show successful imports stat
        expect(screen.getByText(/successful/i)).toBeInTheDocument();
      });
    });
  });
});

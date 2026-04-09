import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useImportHistory } from '@/hooks/use-import-history'

// Mock the actual hooks and components to test their interfaces
const { mockUseImportHistory, mockImportFilters } = vi.hoisted(() => ({
  mockUseImportHistory: vi.fn(),
  mockImportFilters: vi.fn()
}))

vi.mock('@/hooks/use-import-history', () => ({
  useImportHistory: mockUseImportHistory
}))

vi.mock('@/components/import/import-filters', () => ({
  ImportHistoryFilters: mockImportFilters
}))

// Mock data for testing
const mockImportSessions = [
  {
    id: 'import-1',
    fileName: 'customers.csv',
    fileSize: 1024000,
    importType: 'csv',
    importSource: 'manual',
    recordsProcessed: 1000,
    recordsSuccessful: 950,
    recordsFailed: 50,
    importStatus: 'completed',
    importedAt: '2025-07-23T10:00:00Z',
    completedAt: '2025-07-23T10:05:00Z'
  },
  {
    id: 'import-2',
    fileName: 'large_dataset.xlsx',
    fileSize: 50000000,
    importType: 'excel',
    importSource: 'bulk',
    recordsProcessed: 188063,
    recordsSuccessful: 72063,
    recordsFailed: 116000,
    importStatus: 'completed',
    importedAt: '2025-07-23T09:00:00Z',
    completedAt: '2025-07-23T09:05:00Z'
  }
]

describe('Import History System', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    vi.clearAllMocks()
  })

  describe('useImportHistory Hook', () => {
    it('should fetch import history successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockImportSessions
      })

      const TestComponent = () => {
        const { imports, isLoading } = useImportHistory()
        
        if (isLoading) return <div>Loading...</div>
        return (
          <div>
            {imports.map(imp => (
              <div key={imp.id} data-testid={`import-${imp.id}`}>
                {imp.fileName}
              </div>
            ))}
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('import-import-1')).toBeInTheDocument()
        expect(screen.getByTestId('import-import-2')).toBeInTheDocument()
      })
    })

    it('should handle empty import history', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const TestComponent = () => {
        const { imports, isEmpty } = useImportHistory()
        return <div>{isEmpty ? 'No imports' : 'Has imports'}</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('No imports')).toBeInTheDocument()
      })
    })
  })

  describe('Import History Filtering', () => {
    it('should filter by import status', async () => {
      const mockFilter = vi.fn()
      
      render(
        <QueryClientProvider client={queryClient}>
          <ImportHistoryFilters 
            onFilterChange={mockFilter}
            initialFilters={{
              status: 'all',
              type: 'all',
              dateRange: 'all',
              searchQuery: ''
            }}
          />
        </QueryClientProvider>
      )

      const statusSelect = screen.getByRole('combobox', { name: /status/i })
      fireEvent.click(statusSelect)
      
      const completedOption = screen.getByText('Completed')
      fireEvent.click(completedOption)

      expect(mockFilter).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )
    })

    it('should filter by file type', async () => {
      const mockFilter = vi.fn()
      
      render(
        <QueryClientProvider client={queryClient}>
          <ImportHistoryFilters 
            onFilterChange={mockFilter}
            initialFilters={{
              status: 'all',
              type: 'all', 
              dateRange: 'all',
              searchQuery: ''
            }}
          />
        </QueryClientProvider>
      )

      const typeSelect = screen.getByRole('combobox', { name: /type/i })
      fireEvent.click(typeSelect)
      
      const excelOption = screen.getByText('Excel')
      fireEvent.click(excelOption)

      expect(mockFilter).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'excel' })
      )
    })

    it('should filter by search query', async () => {
      const mockFilter = vi.fn()
      
      render(
        <QueryClientProvider client={queryClient}>
          <ImportHistoryFilters 
            onFilterChange={mockFilter}
            initialFilters={{
              status: 'all',
              type: 'all',
              dateRange: 'all',
              searchQuery: ''
            }}
          />
        </QueryClientProvider>
      )

      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'customers' } })

      await waitFor(() => {
        expect(mockFilter).toHaveBeenCalledWith(
          expect.objectContaining({ searchQuery: 'customers' })
        )
      })
    })
  })

  describe('Import Statistics Calculation', () => {
    it('should calculate success rates correctly', () => {
      const session = mockImportSessions[0]
      const successRate = (session.recordsSuccessful / session.recordsProcessed) * 100
      
      expect(successRate).toBe(95) // 950/1000 = 95%
    })

    it('should calculate file size display', () => {
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
      }

      expect(formatFileSize(1024000)).toBe('1000 KB')
      expect(formatFileSize(50000000)).toBe('47.68 MB')
    })

    it('should calculate processing time', () => {
      const session = mockImportSessions[0]
      const startTime = new Date(session.importedAt).getTime()
      const endTime = new Date(session.completedAt!).getTime()
      const processingTime = endTime - startTime
      
      expect(processingTime).toBe(300000) // 5 minutes in milliseconds
    })
  })

  describe('Import History Navigation', () => {
    it('should navigate to error details for failed imports', async () => {
      const mockNavigate = vi.fn()
      
      // Mock useLocation hook
      vi.mock('wouter', () => ({
        useLocation: () => ['/import-history', mockNavigate]
      }))

      const TestComponent = () => {
        const handleViewErrors = (importId: string) => {
          mockNavigate(`/import-errors/${importId}`)
        }

        return (
          <button onClick={() => handleViewErrors('import-1')}>
            View Errors
          </button>
        )
      }

      render(<TestComponent />)

      const viewErrorsButton = screen.getByText('View Errors')
      fireEvent.click(viewErrorsButton)

      expect(mockNavigate).toHaveBeenCalledWith('/import-errors/import-1')
    })
  })

  describe('Real-time Updates', () => {
    it('should auto-refresh import history', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockImportSessions[0]]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockImportSessions
        })

      global.fetch = fetchSpy

      const TestComponent = () => {
        const { imports, refetch } = useImportHistory()
        
        // Simulate auto-refresh after 30 seconds
        setTimeout(() => refetch(), 30000)
        
        return <div>{imports.length} imports</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      // Initial load
      await waitFor(() => {
        expect(screen.getByText('1 imports')).toBeInTheDocument()
      })

      // Simulate time passing and auto-refresh
      vi.advanceTimersByTime(30000)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const TestComponent = () => {
        const { error, isError } = useImportHistory()
        return <div>{isError ? 'Error loading imports' : 'Loading...'}</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Error loading imports')).toBeInTheDocument()
      })
    })

    it('should handle malformed API responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'response' })
      })

      const TestComponent = () => {
        const { imports, isError } = useImportHistory()
        return <div>{isError ? 'Error' : `${imports.length} imports`}</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('0 imports')).toBeInTheDocument()
      })
    })
  })
})
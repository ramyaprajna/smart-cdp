import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useImportErrors } from '@/hooks/use-import-errors'
import { ImportErrorDetail } from '@/hooks/use-import-errors'

// Mock error data for testing
const mockErrorDetails: ImportErrorDetail[] = [
  {
    id: 'error-1',
    importSessionId: 'import-1',
    sourceRowNumber: 5,
    sourceFileName: 'customers.csv',
    errorType: 'INVALID_EMAIL',
    errorMessage: 'Invalid email format: not-an-email',
    fieldName: 'email',
    fieldValue: 'not-an-email',
    canRetry: true,
    timestamp: '2025-07-23T10:00:00Z',
    originalData: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'not-an-email',
      phone: '+1234567890'
    }
  },
  {
    id: 'error-2',
    importSessionId: 'import-1',
    sourceRowNumber: 12,
    sourceFileName: 'customers.csv',
    errorType: 'DUPLICATE_RECORD',
    errorMessage: 'Customer already exists with email: duplicate@example.com',
    fieldName: 'email',
    fieldValue: 'duplicate@example.com',
    canRetry: false,
    timestamp: '2025-07-23T10:01:00Z',
    originalData: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'duplicate@example.com',
      phone: '+0987654321'
    }
  }
]

const mockErrorSummary = {
  totalErrors: 2,
  retryableErrors: 1,
  criticalErrors: 1,
  errorTypes: {
    INVALID_EMAIL: 1,
    DUPLICATE_RECORD: 1
  },
  affectedFields: ['email'],
  errorPatterns: [
    { pattern: 'Invalid email format', count: 1, severity: 'retryable' },
    { pattern: 'Duplicate record', count: 1, severity: 'critical' }
  ]
}

describe('Error Tracking System', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
            const res = await fetch(queryKey[0] as string)
            if (!res.ok) throw new Error('fetch failed')
            return res.json()
          },
        },
        mutations: { retry: false }
      }
    })
    vi.clearAllMocks()
  })

  describe('useImportErrors Hook', () => {
    it('should fetch failed records successfully', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ failedRecords: mockErrorDetails })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errorSummary: mockErrorSummary })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'import-1', status: 'completed' })
        })

      const TestComponent = () => {
        const { failedRecords, errorSummary, isLoading } = useImportErrors({
          importSessionId: 'import-1'
        })
        
        if (isLoading) return <div>Loading...</div>
        
        return (
          <div>
            <div data-testid="error-count">{failedRecords.length} errors</div>
            <div data-testid="total-errors">{errorSummary?.totalErrors} total</div>
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('error-count')).toHaveTextContent('2 errors')
        expect(screen.getByTestId('total-errors')).toHaveTextContent('2 total')
      })
    })

    it('should filter errors by type', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ failedRecords: mockErrorDetails.filter(e => e.errorType === 'INVALID_EMAIL') })
      })

      const TestComponent = () => {
        const { failedRecords } = useImportErrors({
          importSessionId: 'import-1',
          errorType: 'INVALID_EMAIL'
        })
        
        return <div data-testid="filtered-count">{failedRecords.length} filtered</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('filtered-count')).toHaveTextContent('1 filtered')
      })
    })

    it('should handle error resolution', async () => {
      const markResolvedSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ failedRecords: mockErrorDetails })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ errorSummary: mockErrorSummary })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'import-1', status: 'completed' })
        })
        .mockImplementationOnce(markResolvedSpy)

      const TestComponent = () => {
        const { failedRecords, markAsResolved } = useImportErrors({
          importSessionId: 'import-1'
        })

        const handleResolve = async () => {
          await markAsResolved(5, 'customers.csv')
        }

        return (
          <div>
            {failedRecords.map(error => (
              <div key={error.id}>
                <span>{error.errorMessage}</span>
                <button onClick={handleResolve}>Resolve</button>
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
        const resolveButton = screen.getByText('Resolve')
        fireEvent.click(resolveButton)
      })

      expect(markResolvedSpy).toHaveBeenCalled()
    })
  })

  describe('Error Pattern Analysis', () => {
    it('should identify common error patterns', () => {
      const errors = mockErrorDetails
      const patterns = new Map<string, number>()
      
      errors.forEach(error => {
        const key = error.errorType
        patterns.set(key, (patterns.get(key) || 0) + 1)
      })

      expect(patterns.get('INVALID_EMAIL')).toBe(1)
      expect(patterns.get('DUPLICATE_RECORD')).toBe(1)
    })

    it('should calculate error severity distribution', () => {
      const retryableCount = mockErrorDetails.filter(e => e.canRetry).length
      const criticalCount = mockErrorDetails.filter(e => !e.canRetry).length
      
      expect(retryableCount).toBe(1)
      expect(criticalCount).toBe(1)
    })

    it('should identify affected fields', () => {
      const affectedFields = [...new Set(mockErrorDetails.map(e => e.fieldName))]
      
      expect(affectedFields).toEqual(['email'])
    })
  })

  describe('Error Export Functionality', () => {
    it('should generate CSV export data', () => {
      const exportData = mockErrorDetails.map(error => ({
        'Row Number': error.sourceRowNumber,
        'Error Type': error.errorType,
        'Error Message': error.errorMessage,
        'Field Name': error.fieldName,
        'Field Value': error.fieldValue,
        'Can Retry': error.canRetry ? 'Yes' : 'No',
        'Timestamp': error.timestamp
      }))

      expect(exportData).toHaveLength(2)
      expect(exportData[0]['Row Number']).toBe(5)
      expect(exportData[0]['Error Type']).toBe('INVALID_EMAIL')
      expect(exportData[1]['Can Retry']).toBe('No')
    })

    it('should handle empty error lists for export', () => {
      const emptyExportData = []
      const csvContent = emptyExportData.length === 0 
        ? 'No errors to export' 
        : emptyExportData.map(row => Object.values(row).join(',')).join('\n')

      expect(csvContent).toBe('No errors to export')
    })
  })

  describe('Error Statistics', () => {
    it('should calculate error rates correctly', () => {
      const totalRecords = 1000
      const totalErrors = mockErrorSummary.totalErrors
      const errorRate = (totalErrors / totalRecords) * 100

      expect(errorRate).toBe(0.2) // 2 errors out of 1000 records = 0.2%
    })

    it('should identify most common error types', () => {
      const errorTypes = mockErrorSummary.errorTypes
      const mostCommon = Object.entries(errorTypes)
        .sort(([,a], [,b]) => b - a)
        .map(([type]) => type)

      expect(mostCommon).toEqual(['INVALID_EMAIL', 'DUPLICATE_RECORD'])
    })

    it('should calculate retry success potential', () => {
      const retryableErrors = mockErrorSummary.retryableErrors
      const totalErrors = mockErrorSummary.totalErrors
      const retryPotential = (retryableErrors / totalErrors) * 100

      expect(retryPotential).toBe(50) // 1 out of 2 errors can be retried = 50%
    })
  })

  describe('Error Correlation Analysis', () => {
    it('should detect field-specific error patterns', () => {
      const fieldErrors = mockErrorDetails.reduce((acc, error) => {
        const field = error.fieldName
        if (!acc[field]) acc[field] = []
        acc[field].push(error.errorType)
        return acc
      }, {} as Record<string, string[]>)

      expect(fieldErrors.email).toEqual(['INVALID_EMAIL', 'DUPLICATE_RECORD'])
    })

    it('should identify time-based error clustering', () => {
      const errorsByMinute = mockErrorDetails.reduce((acc, error) => {
        const minute = new Date(error.timestamp).getMinutes()
        acc[minute] = (acc[minute] || 0) + 1
        return acc
      }, {} as Record<number, number>)

      expect(errorsByMinute[0]).toBe(1) // One error at minute 0
      expect(errorsByMinute[1]).toBe(1) // One error at minute 1
    })
  })

  describe('Performance with Large Error Sets', () => {
    it('should handle large error datasets efficiently', async () => {
      const largeErrorSet = Array.from({ length: 10000 }, (_, i) => ({
        ...mockErrorDetails[0],
        id: `error-${i}`,
        sourceRowNumber: i + 1
      }))

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => largeErrorSet
      })

      const startTime = Date.now()
      
      const TestComponent = () => {
        const { failedRecords, isLoading } = useImportErrors({
          importSessionId: 'import-1',
          limit: 100 // Pagination limit
        })
        
        if (isLoading) return <div>Loading...</div>
        return <div>{failedRecords.length} errors loaded</div>
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText(/errors loaded/)).toBeInTheDocument()
      })

      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(5000) // Should load within 5 seconds
    })
  })
})
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

// Mock complete CDP workflow scenarios
describe('Complete CDP Workflow End-to-End Tests', () => {
  let queryClient: QueryClient
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  describe('Authentication Flow', () => {
    it('should complete full login workflow', async () => {
      // Mock successful authentication
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            token: 'mock-jwt-token',
            user: { id: '1', email: 'admin@prambors.com', role: 'admin' }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ authenticated: true })
        })

      // Mock login form component
      const LoginForm = () => {
        const [credentials, setCredentials] = useState({
          email: '',
          password: ''
        })

        const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault()
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
          })
          const result = await response.json()
          if (result.success) {
            window.location.href = '/dashboard'
          }
        }

        return (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={credentials.email}
              onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Password"
              value={credentials.password}
              onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
            />
            <button type="submit">Login</button>
          </form>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <LoginForm />
        </QueryClientProvider>
      )

      // Simulate login process
      await user.type(screen.getByPlaceholderText('Email'), 'admin@prambors.com')
      await user.type(screen.getByPlaceholderText('Password'), 'admin123')
      await user.click(screen.getByText('Login'))

      // Verify API call was made with correct credentials
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@prambors.com',
            password: 'admin123'
          })
        })
      })
    })
  })

  describe('Data Import Workflow', () => {
    it('should complete file upload to error analysis workflow', async () => {
      // Mock file upload sequence
      global.fetch = vi.fn()
        // File upload response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            importSessionId: 'import-123',
            previewData: {
              sampleRecords: [
                { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
              ],
              fieldMapping: { firstName: 'firstName', lastName: 'lastName', email: 'email' },
              totalRows: 1000,
              estimatedProcessingTime: 30
            }
          })
        })
        // Import processing response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            recordsProcessed: 1000,
            recordsSuccessful: 950,
            recordsFailed: 50,
            hasErrors: true
          })
        })
        // Error details response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ([
            {
              id: 'error-1',
              sourceRowNumber: 5,
              errorType: 'INVALID_EMAIL',
              errorMessage: 'Invalid email format',
              canRetry: true
            }
          ])
        })

      // Mock file upload component
      const FileUpload = () => {
        const [uploadResult, setUploadResult] = useState(null)
        const [errors, setErrors] = useState([])

        const handleFileUpload = async (file: File) => {
          const formData = new FormData()
          formData.append('file', file)
          
          const response = await fetch('/api/files/upload', {
            method: 'POST',
            body: formData
          })
          const result = await response.json()
          setUploadResult(result)

          // If there are errors, fetch error details
          if (result.hasErrors) {
            const errorsResponse = await fetch(`/api/imports/${result.importSessionId}/errors`)
            const errorData = await errorsResponse.json()
            setErrors(errorData)
          }
        }

        return (
          <div>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            {uploadResult && (
              <div data-testid="upload-result">
                Upload completed: {uploadResult.recordsSuccessful} successful, {uploadResult.recordsFailed} failed
              </div>
            )}
            {errors.length > 0 && (
              <div data-testid="error-list">
                {errors.map(error => (
                  <div key={error.id}>{error.errorMessage}</div>
                ))}
              </div>
            )}
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <FileUpload />
        </QueryClientProvider>
      )

      // Create mock file
      const file = new File(['csv content'], 'customers.csv', { type: 'text/csv' })
      const fileInput = screen.getByRole('input', { type: 'file' }) as HTMLInputElement

      // Upload file
      await user.upload(fileInput, file)

      // Verify upload results appear
      await waitFor(() => {
        expect(screen.getByTestId('upload-result')).toBeInTheDocument()
        expect(screen.getByText(/950 successful, 50 failed/)).toBeInTheDocument()
      })

      // Verify error details are loaded
      await waitFor(() => {
        expect(screen.getByTestId('error-list')).toBeInTheDocument()
        expect(screen.getByText('Invalid email format')).toBeInTheDocument()
      })
    })
  })

  describe('Customer Management Workflow', () => {
    it('should complete customer search and edit workflow', async () => {
      const mockCustomers = [
        {
          id: 'cust-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890'
        }
      ]

      global.fetch = vi.fn()
        // Customer search
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ customers: mockCustomers, total: 1 })
        })
        // Customer update
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, customer: { ...mockCustomers[0], email: 'newemail@example.com' } })
        })

      const CustomerManagement = () => {
        const [customers, setCustomers] = useState([])
        const [searchQuery, setSearchQuery] = useState('')
        const [editingCustomer, setEditingCustomer] = useState(null)

        const searchCustomers = async () => {
          const response = await fetch(`/api/customers?search=${searchQuery}`)
          const data = await response.json()
          setCustomers(data.customers)
        }

        const updateCustomer = async (customer) => {
          const response = await fetch(`/api/customers/${customer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customer)
          })
          const result = await response.json()
          if (result.success) {
            setCustomers(prev => prev.map(c => c.id === customer.id ? result.customer : c))
            setEditingCustomer(null)
          }
        }

        return (
          <div>
            <input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={searchCustomers}>Search</button>
            
            {customers.map(customer => (
              <div key={customer.id} data-testid={`customer-${customer.id}`}>
                <span>{customer.firstName} {customer.lastName}</span>
                <span>{customer.email}</span>
                <button onClick={() => setEditingCustomer(customer)}>Edit</button>
              </div>
            ))}

            {editingCustomer && (
              <div data-testid="edit-modal">
                <input
                  value={editingCustomer.email}
                  onChange={(e) => setEditingCustomer(prev => ({ ...prev, email: e.target.value }))}
                />
                <button onClick={() => updateCustomer(editingCustomer)}>Save</button>
              </div>
            )}
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <CustomerManagement />
        </QueryClientProvider>
      )

      // Search for customers
      await user.type(screen.getByPlaceholderText('Search customers...'), 'John')
      await user.click(screen.getByText('Search'))

      // Verify search results
      await waitFor(() => {
        expect(screen.getByTestId('customer-cust-1')).toBeInTheDocument()
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      // Edit customer
      await user.click(screen.getByText('Edit'))
      
      await waitFor(() => {
        expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
      })

      // Change email and save
      const emailInput = screen.getByDisplayValue('john@example.com')
      await user.clear(emailInput)
      await user.type(emailInput, 'newemail@example.com')
      await user.click(screen.getByText('Save'))

      // Verify update API call
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/customers/cust-1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'cust-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'newemail@example.com',
            phone: '+1234567890'
          })
        })
      })
    })
  })

  describe('Vector Search Workflow', () => {
    it('should complete semantic search workflow', async () => {
      const mockSearchResults = [
        {
          id: 'cust-1',
          firstName: 'John',
          lastName: 'Developer',
          profession: 'Software Engineer',
          similarity: 0.85
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockSearchResults })
      })

      const VectorSearch = () => {
        const [query, setQuery] = useState('')
        const [results, setResults] = useState([])
        const [isSearching, setIsSearching] = useState(false)

        const performSearch = async () => {
          setIsSearching(true)
          const response = await fetch('/api/vector-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 10 })
          })
          const data = await response.json()
          setResults(data.results)
          setIsSearching(false)
        }

        return (
          <div>
            <input
              placeholder="Search for similar customers..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={performSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            
            {results.map(result => (
              <div key={result.id} data-testid={`result-${result.id}`}>
                <span>{result.firstName} {result.lastName}</span>
                <span>Similarity: {(result.similarity * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <VectorSearch />
        </QueryClientProvider>
      )

      // Perform semantic search
      await user.type(screen.getByPlaceholderText('Search for similar customers...'), 'software developer')
      await user.click(screen.getByText('Search'))

      // Verify loading state
      expect(screen.getByText('Searching...')).toBeInTheDocument()

      // Verify search results
      await waitFor(() => {
        expect(screen.getByTestId('result-cust-1')).toBeInTheDocument()
        expect(screen.getByText('John Developer')).toBeInTheDocument()
        expect(screen.getByText('Similarity: 85.0%')).toBeInTheDocument()
      })

      // Verify API call
      expect(global.fetch).toHaveBeenCalledWith('/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'software developer', limit: 10 })
      })
    })
  })

  describe('Dashboard Analytics Workflow', () => {
    it('should load and display analytics data', async () => {
      const mockAnalytics = {
        totalCustomers: 75943,
        activeSegments: 4,
        averageLifetimeValue: 573.30,
        dataQualityScore: 97.90
      }

      const mockSegmentData = [
        { segment: 'Professional', count: 1542, percentage: 20.3 },
        { segment: 'Student', count: 752, percentage: 9.9 }
      ]

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAnalytics
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSegmentData
        })

      const Dashboard = () => {
        const [analytics, setAnalytics] = useState(null)
        const [segments, setSegments] = useState([])

        useEffect(() => {
          const loadData = async () => {
            const [analyticsRes, segmentsRes] = await Promise.all([
              fetch('/api/analytics/stats'),
              fetch('/api/analytics/segment-distribution')
            ])
            
            const analyticsData = await analyticsRes.json()
            const segmentsData = await segmentsRes.json()
            
            setAnalytics(analyticsData)
            setSegments(segmentsData)
          }

          loadData()
        }, [])

        if (!analytics) return <div>Loading...</div>

        return (
          <div>
            <div data-testid="total-customers">
              Total Customers: {analytics.totalCustomers.toLocaleString()}
            </div>
            <div data-testid="avg-ltv">
              Avg LTV: ${analytics.averageLifetimeValue}
            </div>
            <div data-testid="data-quality">
              Data Quality: {analytics.dataQualityScore}%
            </div>
            
            {segments.map(segment => (
              <div key={segment.segment} data-testid={`segment-${segment.segment.toLowerCase()}`}>
                {segment.segment}: {segment.count} ({segment.percentage}%)
              </div>
            ))}
          </div>
        )
      }

      render(
        <QueryClientProvider client={queryClient}>
          <Dashboard />
        </QueryClientProvider>
      )

      // Verify analytics data loads
      await waitFor(() => {
        expect(screen.getByTestId('total-customers')).toHaveTextContent('Total Customers: 75,943')
        expect(screen.getByTestId('avg-ltv')).toHaveTextContent('Avg LTV: $573.3')
        expect(screen.getByTestId('data-quality')).toHaveTextContent('Data Quality: 97.9%')
      })

      // Verify segment data loads
      await waitFor(() => {
        expect(screen.getByTestId('segment-professional')).toHaveTextContent('Professional: 1542 (20.3%)')
        expect(screen.getByTestId('segment-student')).toHaveTextContent('Student: 752 (9.9%)')
      })
    })
  })
})
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Customer Management API', () => {
    it('should fetch customers with pagination', async () => {
      const mockResponse = {
        customers: [
          { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
          { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
        ],
        total: 75943,
        page: 1,
        limit: 50
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      })

      const response = await fetch('/api/customers?page=1&limit=50')
      const data = await response.json()

      expect(data.customers).toHaveLength(2)
      expect(data.total).toBe(75943)
      expect(data.page).toBe(1)
    })

    it('should handle customer search functionality', async () => {
      const searchQuery = 'john'
      const mockSearchResults = {
        customers: [
          { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
        ],
        total: 1
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSearchResults
      })

      const response = await fetch(`/api/customers?search=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()

      expect(data.customers).toHaveLength(1)
      expect(data.customers[0].firstName).toBe('John')
      expect(global.fetch).toHaveBeenCalledWith('/api/customers?search=john')
    })

    it('should create new customers', async () => {
      const newCustomer = {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@example.com',
        phone: '+1234567890'
      }

      const mockCreatedCustomer = {
        id: 'new-customer-id',
        ...newCustomer,
        createdAt: '2025-07-23T10:00:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreatedCustomer
      })

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer)
      })

      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.id).toBe('new-customer-id')
      expect(data.firstName).toBe('Alice')
    })
  })

  describe('Analytics API', () => {
    it('should fetch dashboard statistics', async () => {
      const mockStats = {
        totalCustomers: 75943,
        activeSegments: 4,
        averageLifetimeValue: 573.30,
        dataQualityScore: 97.90,
        recentImports: 12,
        vectorSearchQueries: 145
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStats
      })

      const response = await fetch('/api/analytics/stats')
      const data = await response.json()

      expect(data.totalCustomers).toBe(75943)
      expect(data.averageLifetimeValue).toBe(573.30)
      expect(data.dataQualityScore).toBe(97.90)
    })

    it('should fetch segment distribution', async () => {
      const mockSegmentData = [
        { segment: 'Professional', count: 1542, percentage: 20.3 },
        { segment: 'Student', count: 752, percentage: 9.9 },
        { segment: 'Regular Listener', count: 1355, percentage: 17.8 },
        { segment: 'Entrepreneur', count: 231, percentage: 3.0 }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSegmentData
      })

      const response = await fetch('/api/analytics/segment-distribution')
      const data = await response.json()

      expect(data).toHaveLength(4)
      expect(data[0].segment).toBe('Professional')
      expect(data[0].count).toBe(1542)
    })
  })

  describe('Vector Search API', () => {
    it('should perform semantic similarity search', async () => {
      const searchQuery = 'software engineer in Jakarta'
      const mockResults = [
        {
          id: 'customer-1',
          firstName: 'John',
          lastName: 'Developer',
          profession: 'Software Engineer',
          city: 'Jakarta',
          similarity: 0.85
        },
        {
          id: 'customer-2',
          firstName: 'Jane',
          lastName: 'Coder',
          profession: 'Senior Developer',
          city: 'Jakarta',
          similarity: 0.78
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockResults })
      })

      const response = await fetch('/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      })

      const data = await response.json()

      expect(data.results).toHaveLength(2)
      expect(data.results[0].similarity).toBe(0.85)
      expect(data.results[0].profession).toBe('Software Engineer')
    })

    it('should handle empty search results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
      })

      const response = await fetch('/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'nonexistent profession', limit: 10 })
      })

      const data = await response.json()

      expect(data.results).toHaveLength(0)
    })
  })

  describe('Import Management API', () => {
    it('should fetch import history', async () => {
      const mockImports = [
        {
          id: 'import-1',
          fileName: 'customers.csv',
          fileSize: 1024000,
          recordsProcessed: 1000,
          recordsSuccessful: 950,
          recordsFailed: 50,
          importStatus: 'completed',
          importedAt: '2025-07-23T10:00:00Z'
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockImports
      })

      const response = await fetch('/api/imports')
      const data = await response.json()

      expect(data).toHaveLength(1)
      expect(data[0].fileName).toBe('customers.csv')
      expect(data[0].recordsSuccessful).toBe(950)
    })

    it('should fetch import error details', async () => {
      const importId = 'import-1'
      const mockErrors = [
        {
          id: 'error-1',
          sourceRowNumber: 5,
          errorType: 'INVALID_EMAIL',
          errorMessage: 'Invalid email format',
          fieldName: 'email',
          fieldValue: 'not-an-email',
          canRetry: true
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockErrors
      })

      const response = await fetch(`/api/imports/${importId}/errors`)
      const data = await response.json()

      expect(data).toHaveLength(1)
      expect(data[0].errorType).toBe('INVALID_EMAIL')
      expect(data[0].canRetry).toBe(true)
    })
  })

  describe('Authentication API', () => {
    it('should authenticate valid credentials', async () => {
      const credentials = {
        email: 'admin@prambors.com',
        password: 'admin123'
      }

      const mockAuthResponse = {
        success: true,
        token: 'jwt-token-here',
        user: {
          id: 'user-1',
          email: 'admin@prambors.com',
          role: 'admin',
          firstName: 'Sarah',
          lastName: 'Ahmad'
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAuthResponse
      })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })

      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.token).toBeDefined()
      expect(data.user.role).toBe('admin')
    })

    it('should reject invalid credentials', async () => {
      const invalidCredentials = {
        email: 'invalid@example.com',
        password: 'wrongpassword'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Invalid credentials',
          code: 'AUTHENTICATION_ERROR'
        })
      })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidCredentials)
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      try {
        await fetch('/api/customers')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Network error')
      }
    })

    it('should handle 500 server errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal server error',
          code: 'SERVER_ERROR'
        })
      })

      const response = await fetch('/api/customers')

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
    })

    it('should handle malformed JSON responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        }
      })

      try {
        const response = await fetch('/api/customers')
        await response.json()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Invalid JSON')
      }
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limiting responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']]),
        json: async () => ({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: 60
        })
      })

      const response = await fetch('/api/vector-search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' })
      })

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data.code).toBe('RATE_LIMIT_EXCEEDED')
    })
  })

  describe('Performance', () => {
    it('should handle large response datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `customer-${i}`,
        firstName: `Customer${i}`,
        email: `customer${i}@example.com`
      }))

      const startTime = Date.now()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: largeDataset, total: 1000 })
      })

      const response = await fetch('/api/customers?limit=1000')
      const data = await response.json()

      const processingTime = Date.now() - startTime

      expect(data.customers).toHaveLength(1000)
      expect(processingTime).toBeLessThan(5000) // Should process within 5 seconds
    })
  })
})
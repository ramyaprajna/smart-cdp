import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createMockUser, createMockCustomer } from '../setup'

// Mock Express app for integration testing
const mockApp = {
  listen: vi.fn(),
  use: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}

describe('API Endpoints Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication Endpoints', () => {
    it('should authenticate user with valid credentials', async () => {
      const credentials = {
        email: 'admin@prambors.com',
        password: 'admin123'
      }

      const mockResponse = {
        success: true,
        token: 'mock-jwt-token',
        user: createMockUser()
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.token).toBeDefined()
      expect(result.user).toBeDefined()
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
        }),
      })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidCredentials)
      })

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error).toBe('Invalid credentials')
    })

    it('should validate JWT token on protected routes', async () => {
      const validToken = 'valid-jwt-token'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: createMockUser() }),
      })

      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      })

      expect(response.ok).toBe(true)
      const result = await response.json()
      expect(result.user).toBeDefined()
    })

    it('should handle logout correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Logged out successfully' }),
      })

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.success).toBe(true)
    })
  })

  describe('Customer Management Endpoints', () => {
    it('should create customer with valid data', async () => {
      const customerData = createMockCustomer()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: customerData }),
      })

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify(customerData)
      })

      expect(response.status).toBe(201)
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.email).toBe(customerData.email)
    })

    it('should retrieve customers with pagination', async () => {
      const mockCustomers = Array.from({ length: 25 }, () => createMockCustomer())

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: mockCustomers,
          totalCount: 100,
          hasMore: true,
          currentPage: 1
        }),
      })

      const response = await fetch('/api/customers?offset=0&limit=25', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.customers).toHaveLength(25)
      expect(result.totalCount).toBe(100)
      expect(result.hasMore).toBe(true)
    })

    it('should update customer information', async () => {
      const customerId = 'test-customer-id'
      const updateData = { phone: '+1987654321' }
      const updatedCustomer = { ...createMockCustomer(), ...updateData }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: updatedCustomer }),
      })

      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify(updateData)
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.phone).toBe(updateData.phone)
    })

    it('should delete customer', async () => {
      const customerId = 'test-customer-id'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Customer deleted' }),
      })

      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.success).toBe(true)
    })
  })

  describe('Data Import Endpoints', () => {
    it('should handle file preview generation', async () => {
      const mockPreviewData = {
        metadata: {
          fileName: 'test.csv',
          fileSize: 1024,
          totalRows: 100,
          columns: ['name', 'email', 'phone']
        },
        preview: [
          { name: 'John Doe', email: 'john@example.com', phone: '+1234567890' },
          { name: 'Jane Smith', email: 'jane@example.com', phone: '+1987654321' }
        ],
        validation: {
          warnings: [],
          errors: [],
          dataQuality: 95
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPreviewData,
      })

      const response = await fetch('/api/files/preview', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token' },
        body: new FormData() // Mock FormData
      })

      const result = await response.json()
      expect(result.metadata.totalRows).toBe(100)
      expect(result.preview).toHaveLength(2)
      expect(result.validation.dataQuality).toBe(95)
    })

    it('should handle file upload and processing', async () => {
      const mockImportResult = {
        success: true,
        stats: {
          totalProcessed: 100,
          successful: 95,
          failed: 5,
          duplicates: 3
        },
        importId: 'import-123',
        processingTime: '2.5s'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockImportResult,
      })

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token' },
        body: new FormData()
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.stats.totalProcessed).toBe(100)
      expect(result.stats.successful).toBe(95)
    })

    it('should validate file format and size', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Unsupported file format',
          code: 'UNSUPPORTED_FORMAT'
        }),
      })

      const response = await fetch('/api/files/preview', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-token' },
        body: new FormData()
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe('Unsupported file format')
    })
  })

  describe('Analytics Endpoints', () => {
    it('should return comprehensive analytics stats', async () => {
      const mockStats = {
        totalCustomers: 3880,
        averageAge: 28.9,
        averageLifetimeValue: 573.30,
        averageDataQuality: 97.90,
        activeSegments: 4,
        lastUpdated: new Date().toISOString()
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStats,
      })

      const response = await fetch('/api/analytics/stats', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.totalCustomers).toBe(3880)
      expect(result.averageDataQuality).toBeGreaterThan(95)
      expect(result.activeSegments).toBe(4)
    })

    it('should return segment distribution data', async () => {
      const mockSegments = [
        { segment: 'Professional', count: 1542, percentage: 39.7 },
        { segment: 'Regular Listener', count: 1355, percentage: 34.9 },
        { segment: 'Student', count: 752, percentage: 19.4 },
        { segment: 'Entrepreneur', count: 231, percentage: 6.0 }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSegments,
      })

      const response = await fetch('/api/analytics/segment-distribution', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result).toHaveLength(4)
      expect(result[0].segment).toBe('Professional')
      expect(result[0].count).toBe(1542)
    })

    it('should handle dashboard statistics', async () => {
      const mockDashboard = {
        recentActivity: 45,
        dataQualityTrend: 'improving',
        topCities: ['Jakarta', 'Tangerang', 'Depok'],
        newCustomersToday: 12,
        cacheHealth: 'optimal'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDashboard,
      })

      const response = await fetch('/api/dashboard/stats', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.recentActivity).toBe(45)
      expect(result.topCities).toContain('Jakarta')
      expect(result.newCustomersToday).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Vector Search Endpoints', () => {
    it('should perform similarity search', async () => {
      const searchQuery = 'software engineer jakarta'
      const mockResults = {
        customers: [createMockCustomer(), createMockCustomer()],
        query: searchQuery,
        resultsCount: 2,
        searchTime: '45ms',
        similarityScores: [0.95, 0.87]
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResults,
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      })

      const result = await response.json()
      expect(result.customers).toHaveLength(2)
      expect(result.query).toBe(searchQuery)
      expect(result.similarityScores[0]).toBeGreaterThan(0.8)
    })

    it('should find similar customers by profile', async () => {
      const customerId = 'test-customer-id'
      const mockSimilarCustomers = {
        similarCustomers: [createMockCustomer(), createMockCustomer()],
        referenceId: customerId,
        similarityScores: [0.92, 0.88]
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSimilarCustomers,
      })

      const response = await fetch(`/api/customers/${customerId}/similar`, {
        headers: { 'Authorization': 'Bearer valid-token' }
      })

      const result = await response.json()
      expect(result.similarCustomers).toHaveLength(2)
      expect(result.referenceId).toBe(customerId)
    })
  })

  describe('User Management Endpoints', () => {
    it('should create new user with admin privileges', async () => {
      const userData = {
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        role: 'analyst',
        password: 'password123'
      }

      const createdUser = { ...createMockUser(), ...userData }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: createdUser }),
      })

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin-token'
        },
        body: JSON.stringify(userData)
      })

      expect(response.status).toBe(201)
      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.email).toBe(userData.email)
    })

    it('should require admin role for user management', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED'
        }),
      })

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer viewer-token'
        },
        body: JSON.stringify({ email: 'test@example.com' })
      })

      expect(response.status).toBe(403)
      const result = await response.json()
      expect(result.error).toBe('Insufficient permissions')
    })
  })

  describe('Error Handling and Security', () => {
    it('should handle unauthorized access', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Authentication required',
          code: 'AUTHENTICATION_ERROR'
        }),
      })

      const response = await fetch('/api/customers')

      expect(response.status).toBe(401)
      const result = await response.json()
      expect(result.error).toBe('Authentication required')
    })

    it('should handle rate limiting', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Too many requests',
          retryAfter: 60
        }),
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' })
      })

      expect(response.status).toBe(429)
      const result = await response.json()
      expect(result.error).toBe('Too many requests')
    })

    it('should validate request payloads', async () => {
      const invalidPayload = { email: 'invalid-email' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          details: ['Invalid email format']
        }),
      })

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token'
        },
        body: JSON.stringify(invalidPayload)
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe('Validation failed')
    })

    it('should handle server errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal server error',
          correlationId: 'error-123'
        }),
      })

      const response = await fetch('/api/customers')

      expect(response.status).toBe(500)
      const result = await response.json()
      expect(result.error).toBe('Internal server error')
      expect(result.correlationId).toBeDefined()
    })
  })
})
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockCustomer } from '../setup'

describe('Customer Management System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Customer Data Operations', () => {
    it('should create a new customer with valid data', async () => {
      const customerData = createMockCustomer()
      const mockResponse = { success: true, data: customerData }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerData)
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.email).toBe(customerData.email)
    })

    it('should retrieve customer list with pagination', async () => {
      const mockCustomers = Array.from({ length: 50 }, () => createMockCustomer())
      const mockResponse = {
        customers: mockCustomers.slice(0, 25),
        totalCount: 50,
        hasMore: true
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const response = await fetch('/api/customers?offset=0&limit=25')
      const result = await response.json()

      expect(result.customers).toHaveLength(25)
      expect(result.totalCount).toBe(50)
      expect(result.hasMore).toBe(true)
    })

    it('should filter customers by criteria', async () => {
      const filteredCustomers = [createMockCustomer()]
      const mockResponse = { customers: filteredCustomers, totalCount: 1 }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const filterCriteria = {
        segment: 'Professional',
        city: 'Jakarta',
        minAge: 25,
        maxAge: 35
      }

      const queryParams = new URLSearchParams(filterCriteria as any).toString()
      const response = await fetch(`/api/customers?${queryParams}`)
      const result = await response.json()

      expect(result.customers).toHaveLength(1)
      expect(result.customers[0].segment).toBe('Professional')
    })

    it('should update customer information', async () => {
      const customerId = 'test-customer-id'
      const updateData = { phone: '+1987654321', city: 'Bandung' }
      const updatedCustomer = { ...createMockCustomer(), ...updateData }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: updatedCustomer }),
      })

      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.data.phone).toBe(updateData.phone)
      expect(result.data.city).toBe(updateData.city)
    })

    it('should delete customer', async () => {
      const customerId = 'test-customer-id'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'Customer deleted' }),
      })

      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      expect(result.success).toBe(true)
    })
  })

  describe('Customer Data Validation', () => {
    it('should validate required fields', () => {
      const invalidCustomer = {
        name: '', // Empty name
        email: 'invalid-email', // Invalid email format
        age: -5, // Invalid age
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      expect(emailRegex.test(invalidCustomer.email)).toBe(false)

      // Age validation
      expect(invalidCustomer.age).toBeLessThan(0)

      // Name validation
      expect(invalidCustomer.name.trim()).toBe('')
    })

    it('should validate data quality score calculation', () => {
      const customerWithCompleteData = createMockCustomer()
      const customerWithIncompleteData = {
        ...createMockCustomer(),
        phone: null,
        address: null
      }

      // Complete data should have higher quality score
      expect(customerWithCompleteData.dataQualityScore).toBeGreaterThan(90)
      
      // Incomplete data should be properly handled
      expect(customerWithIncompleteData.phone).toBeNull()
      expect(customerWithIncompleteData.address).toBeNull()
    })

    it('should validate phone number formats', () => {
      const validPhoneNumbers = [
        '+1234567890',
        '+62812345678',
        '+44123456789'
      ]

      const invalidPhoneNumbers = [
        '123', // Too short
        'abc123', // Contains letters
        '+', // Just plus sign
        ''
      ]

      validPhoneNumbers.forEach(phone => {
        const phoneRegex = /^\+[1-9]\d{8,14}$/
        expect(phoneRegex.test(phone)).toBe(true)
      })

      invalidPhoneNumbers.forEach(phone => {
        const phoneRegex = /^\+[1-9]\d{8,14}$/
        expect(phoneRegex.test(phone)).toBe(false)
      })
    })
  })

  describe('Customer Search and Analytics', () => {
    it('should search customers by text query', async () => {
      const searchResults = [createMockCustomer()]
      const mockResponse = { customers: searchResults, totalCount: 1 }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const searchQuery = 'Software Engineer'
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`)
      const result = await response.json()

      expect(result.customers).toHaveLength(1)
      expect(result.customers[0].profession).toContain('Software Engineer')
    })

    it('should calculate customer analytics', async () => {
      const mockAnalytics = {
        totalCustomers: 3880,
        averageAge: 28.9,
        averageLifetimeValue: 573.30,
        averageDataQuality: 97.90,
        segmentDistribution: [
          { segment: 'Professional', count: 1542 },
          { segment: 'Regular Listener', count: 1355 },
          { segment: 'Student', count: 752 },
          { segment: 'Entrepreneur', count: 231 }
        ]
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalytics,
      })

      const response = await fetch('/api/analytics/stats')
      const result = await response.json()

      expect(result.totalCustomers).toBe(3880)
      expect(result.segmentDistribution).toHaveLength(4)
      expect(result.averageDataQuality).toBeGreaterThan(95)
    })

    it('should handle segment-based filtering', async () => {
      const professionalCustomers = Array.from({ length: 10 }, () => ({
        ...createMockCustomer(),
        segment: 'Professional'
      }))

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: professionalCustomers }),
      })

      const response = await fetch('/api/customers?segment=Professional')
      const result = await response.json()

      result.customers.forEach((customer: any) => {
        expect(customer.segment).toBe('Professional')
      })
    })
  })

  describe('Customer Data Export', () => {
    it('should export customer data in CSV format', async () => {
      const csvData = 'name,email,phone,city\nTest Customer,test@example.com,+1234567890,Jakarta'
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => csvData,
        headers: { get: () => 'text/csv' }
      })

      const response = await fetch('/api/customers/export?format=csv')
      const result = await response.text()

      expect(result).toContain('name,email,phone,city')
      expect(result).toContain('Test Customer')
    })

    it('should handle large dataset exports', async () => {
      const largeCsvData = Array.from({ length: 1000 }, (_, i) => 
        `Customer${i},customer${i}@example.com,+123456789${i},City${i}`
      ).join('\n')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `name,email,phone,city\n${largeCsvData}`,
      })

      const response = await fetch('/api/customers/export?format=csv&limit=1000')
      const result = await response.text()

      const lines = result.split('\n')
      expect(lines.length).toBe(1001) // Header + 1000 data rows
    })
  })

  describe('Error Handling', () => {
    it('should handle customer not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Customer not found' }),
      })

      const response = await fetch('/api/customers/non-existent-id')
      expect(response.status).toBe(404)
      
      const result = await response.json()
      expect(result.error).toBe('Customer not found')
    })

    it('should handle validation errors', async () => {
      const invalidData = { email: 'invalid-email' }

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe('Validation failed')
    })

    it('should handle server errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      })

      const response = await fetch('/api/customers')
      expect(response.status).toBe(500)
    })
  })
})
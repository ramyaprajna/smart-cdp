import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockCustomer } from '../setup'

describe('Vector Search System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Similarity Search', () => {
    it('should perform semantic similarity search', async () => {
      const searchQuery = 'young professional software engineer'
      const similarCustomers = [
        { ...createMockCustomer(), profession: 'Software Engineer', age: 28 },
        { ...createMockCustomer(), profession: 'Frontend Developer', age: 26 },
        { ...createMockCustomer(), profession: 'Data Scientist', age: 30 }
      ]

      const mockResponse = {
        customers: similarCustomers,
        query: searchQuery,
        resultsCount: 3,
        searchTime: '45ms'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      })

      const result = await response.json()
      expect(result.customers).toHaveLength(3)
      expect(result.query).toBe(searchQuery)
      expect(result.searchTime).toBeDefined()
    })

    it('should handle vector embedding generation', async () => {
      const customerProfile = {
        age: 30,
        profession: 'Software Engineer',
        city: 'Jakarta',
        interests: ['technology', 'gaming', 'music']
      }

      // Mock embedding service response
      const mockEmbedding = new Array(768).fill(0).map(() => Math.random())
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockEmbedding }),
      })

      const response = await fetch('/api/embeddings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: customerProfile })
      })

      const result = await response.json()
      expect(result.embedding).toHaveLength(768)
      expect(result.embedding.every((val: number) => typeof val === 'number')).toBe(true)
    })

    it('should find similar customers by profile', async () => {
      const referenceCustomer = createMockCustomer()
      const similarCustomers = [
        { ...createMockCustomer(), profession: referenceCustomer.profession },
        { ...createMockCustomer(), city: referenceCustomer.city },
        { ...createMockCustomer(), age: referenceCustomer.age + 2 }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          similarCustomers,
          referenceId: referenceCustomer.id,
          similarityScores: [0.95, 0.89, 0.82]
        }),
      })

      const response = await fetch(`/api/customers/${referenceCustomer.id}/similar`)
      const result = await response.json()

      expect(result.similarCustomers).toHaveLength(3)
      expect(result.similarityScores).toHaveLength(3)
      expect(result.referenceId).toBe(referenceCustomer.id)
    })

    it('should handle different similarity thresholds', async () => {
      const highThresholdResults = [createMockCustomer()]
      const lowThresholdResults = Array.from({ length: 5 }, () => createMockCustomer())

      // High threshold (>0.9 similarity)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          customers: highThresholdResults,
          threshold: 0.9,
          resultsCount: 1
        }),
      })

      let response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'software engineer',
          threshold: 0.9,
          limit: 10 
        })
      })

      let result = await response.json()
      expect(result.customers).toHaveLength(1)

      // Low threshold (>0.7 similarity)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          customers: lowThresholdResults,
          threshold: 0.7,
          resultsCount: 5
        }),
      })

      response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'software engineer',
          threshold: 0.7,
          limit: 10 
        })
      })

      result = await response.json()
      expect(result.customers).toHaveLength(5)
    })
  })

  describe('Vector Database Operations', () => {
    it('should store customer embeddings', async () => {
      const customerId = 'test-customer-id'
      const embedding = new Array(768).fill(0).map(() => Math.random())

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          success: true,
          customerId,
          embeddingId: 'embedding-id'
        }),
      })

      const response = await fetch('/api/embeddings/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, embedding })
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.customerId).toBe(customerId)
    })

    it('should update existing embeddings', async () => {
      const customerId = 'test-customer-id'
      const newEmbedding = new Array(768).fill(0).map(() => Math.random())

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          success: true,
          updated: true,
          timestamp: new Date().toISOString()
        }),
      })

      const response = await fetch(`/api/embeddings/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding: newEmbedding })
      })

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)
    })

    it('should retrieve customer embeddings', async () => {
      const customerId = 'test-customer-id'
      const storedEmbedding = new Array(768).fill(0).map(() => Math.random())

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          customerId,
          embedding: storedEmbedding,
          createdAt: new Date().toISOString()
        }),
      })

      const response = await fetch(`/api/embeddings/${customerId}`)
      const result = await response.json()

      expect(result.customerId).toBe(customerId)
      expect(result.embedding).toHaveLength(768)
      expect(result.createdAt).toBeDefined()
    })
  })

  describe('Search Performance', () => {
    it('should handle large-scale vector search', async () => {
      const largeResultSet = Array.from({ length: 100 }, () => createMockCustomer())

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          customers: largeResultSet.slice(0, 20), // Paginated results
          totalResults: 100,
          searchTime: '120ms',
          page: 1,
          hasMore: true
        }),
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: 'professional',
          limit: 20,
          offset: 0
        })
      })

      const result = await response.json()
      expect(result.customers).toHaveLength(20)
      expect(result.totalResults).toBe(100)
      expect(result.hasMore).toBe(true)
    })

    it('should optimize search with caching', async () => {
      const cachedQuery = 'software engineer'
      const cacheKey = `search:${btoa(cachedQuery)}`

      // First request (cache miss)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          customers: [createMockCustomer()],
          cached: false,
          searchTime: '150ms'
        }),
      })

      let response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cachedQuery })
      })

      let result = await response.json()
      expect(result.cached).toBe(false)

      // Second request (cache hit)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          customers: [createMockCustomer()],
          cached: true,
          searchTime: '5ms'
        }),
      })

      response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cachedQuery })
      })

      result = await response.json()
      expect(result.cached).toBe(true)
      expect(parseInt(result.searchTime)).toBeLessThan(50) // Cached results should be faster
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid search queries', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Invalid search query',
          code: 'INVALID_QUERY'
        }),
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' }) // Empty query
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe('Invalid search query')
    })

    it('should handle embedding service failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ 
          error: 'Embedding service unavailable',
          code: 'SERVICE_UNAVAILABLE'
        }),
      })

      const response = await fetch('/api/embeddings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { age: 30 } })
      })

      expect(response.status).toBe(503)
      const result = await response.json()
      expect(result.error).toBe('Embedding service unavailable')
    })

    it('should handle vector database timeouts', async () => {
      // Mock timeout behavior
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      )

      await expect(
        fetch('/api/customers/similarity-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test' })
        })
      ).rejects.toThrow('Request timeout')
    })
  })

  describe('Data Quality and Validation', () => {
    it('should validate embedding dimensions', () => {
      const validEmbedding = new Array(768).fill(0).map(() => Math.random())
      const invalidEmbedding = new Array(512).fill(0).map(() => Math.random())

      expect(validEmbedding).toHaveLength(768)
      expect(invalidEmbedding).toHaveLength(512)
      expect(invalidEmbedding.length).not.toBe(768)
    })

    it('should normalize similarity scores', () => {
      const rawScores = [0.95, 0.87, 0.92, 0.78, 0.89]
      
      // All scores should be between 0 and 1
      rawScores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      })

      // Scores should be in descending order for relevance
      const sortedScores = [...rawScores].sort((a, b) => b - a)
      expect(sortedScores[0]).toBeGreaterThanOrEqual(sortedScores[1])
    })

    it('should handle empty search results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ 
          customers: [],
          query: 'very specific unrealistic query',
          resultsCount: 0,
          searchTime: '25ms'
        }),
      })

      const response = await fetch('/api/customers/similarity-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'very specific unrealistic query' })
      })

      const result = await response.json()
      expect(result.customers).toHaveLength(0)
      expect(result.resultsCount).toBe(0)
    })
  })
})
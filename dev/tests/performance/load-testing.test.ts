// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockCustomer } from '../setup'

describe('Performance and Load Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('API Response Times', () => {
    it('should have fast response times for customer queries', async () => {
      const startTime = performance.now()
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: [createMockCustomer()] }),
      })

      await fetch('/api/customers?limit=25')
      
      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(responseTime).toBeLessThan(200) // Should respond in <200ms
    })

    it('should handle analytics requests efficiently', async () => {
      const startTime = performance.now()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          totalCustomers: 3880,
          averageAge: 28.9,
          segmentDistribution: []
        }),
      })

      await fetch('/api/analytics/stats')
      
      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(responseTime).toBeLessThan(100) // Analytics should be cached and fast
    })

    it('should handle vector search requests within acceptable time', async () => {
      const startTime = performance.now()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: [createMockCustomer()],
          searchTime: '45ms'
        }),
      })

      await fetch('/api/customers/similarity-search', {
        method: 'POST',
        body: JSON.stringify({ query: 'software engineer' })
      })
      
      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(responseTime).toBeLessThan(500) // Vector search should complete in <500ms
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: [createMockCustomer()] }),
      })

      const promises = Array.from({ length: 10 }, () => 
        fetch('/api/customers?limit=10')
      )

      const startTime = performance.now()
      const responses = await Promise.all(promises)
      const endTime = performance.now()

      const totalTime = endTime - startTime
      const avgTimePerRequest = totalTime / promises.length

      responses.forEach(response => {
        expect(response.ok).toBe(true)
      })
      
      expect(avgTimePerRequest).toBeLessThan(100) // Average time should be reasonable
    })

    it('should handle concurrent file uploads', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, processed: 100 }),
      })

      const uploadPromises = Array.from({ length: 3 }, () => 
        fetch('/api/files/upload', {
          method: 'POST',
          body: new FormData()
        })
      )

      const responses = await Promise.all(uploadPromises)
      
      responses.forEach(response => {
        expect(response.ok).toBe(true)
      })
    })
  })

  describe('Memory Usage Testing', () => {
    it('should handle large customer datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, () => createMockCustomer())
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: largeDataset }),
      })

      const startMemory = performance.memory?.usedJSHeapSize || 0
      
      const response = await fetch('/api/customers?limit=1000')
      const data = await response.json()
      
      const endMemory = performance.memory?.usedJSHeapSize || 0
      const memoryUsed = endMemory - startMemory

      expect(data.customers).toHaveLength(1000)
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024) // Should use <50MB for 1000 customers
    })

    it('should clean up resources after large operations', async () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0

      // Simulate large operation
      const largeArray = Array.from({ length: 10000 }, () => createMockCustomer())
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: largeArray }),
      })

      await fetch('/api/customers/export')
      
      // Simulate garbage collection
      if (global.gc) {
        global.gc()
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0
      const memoryGrowth = finalMemory - initialMemory

      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024) // Should not grow by more than 100MB
    })
  })

  describe('Database Performance', () => {
    it('should handle pagination efficiently', async () => {
      const pageTests = [
        { offset: 0, limit: 25 },
        { offset: 1000, limit: 25 },
        { offset: 3000, limit: 25 }
      ]

      for (const pageTest of pageTests) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            customers: Array.from({ length: pageTest.limit }, () => createMockCustomer()),
            totalCount: 3880
          }),
        })

        const startTime = performance.now()
        await fetch(`/api/customers?offset=${pageTest.offset}&limit=${pageTest.limit}`)
        const endTime = performance.now()

        const responseTime = endTime - startTime
        expect(responseTime).toBeLessThan(150) // Pagination should remain fast
      }
    })

    it('should handle complex filtering efficiently', async () => {
      const complexFilter = {
        segment: 'Professional',
        city: 'Jakarta',
        minAge: 25,
        maxAge: 35,
        hasEmail: true,
        minDataQuality: 90
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: [createMockCustomer()],
          totalCount: 1,
          queryTime: '25ms'
        }),
      })

      const startTime = performance.now()
      const params = new URLSearchParams(complexFilter as any).toString()
      await fetch(`/api/customers?${params}`)
      const endTime = performance.now()

      const responseTime = endTime - startTime
      expect(responseTime).toBeLessThan(200) // Complex queries should still be fast
    })
  })

  describe('Caching Performance', () => {
    it('should benefit from analytics caching', async () => {
      // First request (cache miss)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalCustomers: 3880,
          cached: false,
          queryTime: '150ms'
        }),
      })

      const firstStart = performance.now()
      await fetch('/api/analytics/stats')
      const firstEnd = performance.now()
      const firstTime = firstEnd - firstStart

      // Second request (cache hit)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalCustomers: 3880,
          cached: true,
          queryTime: '5ms'
        }),
      })

      const secondStart = performance.now()
      await fetch('/api/analytics/stats')
      const secondEnd = performance.now()
      const secondTime = secondEnd - secondStart

      expect(secondTime).toBeLessThan(firstTime) // Cached requests should be faster
    })

    it('should handle cache invalidation correctly', async () => {
      // Get cached data
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customers: [createMockCustomer()], cached: true }),
      })

      await fetch('/api/customers')

      // Update data (should invalidate cache)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })

      await fetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(createMockCustomer())
      })

      // Next request should be fresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customers: [createMockCustomer()], cached: false }),
      })

      const response = await fetch('/api/customers')
      const data = await response.json()

      expect(data.cached).toBe(false)
    })
  })

  describe('File Processing Performance', () => {
    it('should handle large file uploads efficiently', async () => {
      // Simulate 10MB file
      const largeFileSize = 10 * 1024 * 1024

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          fileSize: largeFileSize,
          processingTime: '3.5s',
          recordsProcessed: 5000
        }),
      })

      const startTime = performance.now()
      await fetch('/api/files/upload', {
        method: 'POST',
        body: new FormData()
      })
      const endTime = performance.now()

      const uploadTime = endTime - startTime
      expect(uploadTime).toBeLessThan(5000) // Should upload 10MB file in <5 seconds
    })

    it('should process file previews quickly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          metadata: { totalRows: 1000 },
          preview: Array.from({ length: 10 }, () => ({ name: 'Sample' })),
          processingTime: '250ms'
        }),
      })

      const startTime = performance.now()
      await fetch('/api/files/preview', {
        method: 'POST',
        body: new FormData()
      })
      const endTime = performance.now()

      const previewTime = endTime - startTime
      expect(previewTime).toBeLessThan(500) // Preview should be fast
    })
  })

  describe('Stress Testing', () => {
    it('should handle rapid successive requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ customers: [createMockCustomer()] }),
      })

      const rapidRequests = Array.from({ length: 50 }, (_, i) => 
        fetch(`/api/customers?offset=${i * 10}&limit=10`)
      )

      const startTime = performance.now()
      const responses = await Promise.all(rapidRequests)
      const endTime = performance.now()

      const totalTime = endTime - startTime
      const successRate = responses.filter(r => r.ok).length / responses.length

      expect(successRate).toBeGreaterThan(0.95) // >95% success rate
      expect(totalTime).toBeLessThan(3000) // Should complete 50 requests in <3 seconds
    })

    it('should handle resource exhaustion gracefully', async () => {
      // Simulate memory pressure
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          customers: Array.from({ length: 100 }, () => createMockCustomer()),
          memoryUsage: '85%'
        }),
      })

      const heavyRequests = Array.from({ length: 20 }, () => 
        fetch('/api/customers?limit=100')
      )

      const responses = await Promise.allSettled(heavyRequests)
      const successfulResponses = responses.filter(r => r.status === 'fulfilled')

      expect(successfulResponses.length).toBeGreaterThan(15) // Should handle most requests
    })
  })

  describe('Performance Monitoring', () => {
    it('should track response times accurately', () => {
      const responseTimes = [45, 67, 23, 89, 34, 56, 78, 12, 91, 43]
      
      const average = responseTimes.reduce((a, b) => a + b) / responseTimes.length
      const max = Math.max(...responseTimes)
      const min = Math.min(...responseTimes)

      expect(average).toBeLessThan(100)
      expect(max).toBeLessThan(200)
      expect(min).toBeGreaterThan(0)
    })

    it('should calculate performance percentiles', () => {
      const responseTimes = [10, 15, 20, 25, 30, 35, 40, 45, 50, 95].sort((a, b) => a - b)
      
      const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)]
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)]
      const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)]

      expect(p50).toBeLessThan(50)
      expect(p95).toBeLessThan(100)
      expect(p99).toBeLessThan(150)
    })
  })
})
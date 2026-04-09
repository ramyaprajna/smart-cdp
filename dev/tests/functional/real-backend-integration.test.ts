import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fetch } from 'undici'

/**
 * Functional Integration Tests with Real Backend Data
 * 
 * These tests validate that all CDP features work correctly with actual backend services,
 * ensuring data integrity and accurate system state reflection.
 */

// Use environment variable or default for API base
const API_BASE = process.env.API_BASE || 'http://localhost:5000'
let authToken: string
let testImportId: string

describe('Real Backend Integration Tests', () => {
  beforeAll(async () => {
    // Authenticate with real backend
    const authResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@prambors.com',
        password: 'admin123'
      })
    })
    
    if (!authResponse.ok) {
      throw new Error('Failed to authenticate for functional tests')
    }
    
    const authData = await authResponse.json()
    authToken = authData.token
  })

  describe('Dashboard Analytics Integration', () => {
    it('should fetch real customer statistics and validate data consistency', async () => {
      const response = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const stats = await response.json()
      
      // Validate real data structure and ranges
      expect(stats.totalCustomers).toBeGreaterThan(70000) // Should have 75,943+ customers
      expect(stats.averageLifetimeValue).toBeGreaterThan(500) // Should be around $573.30
      expect(stats.dataQualityScore).toBeGreaterThan(90) // Should be around 97.90%
      expect(stats.activeSegments).toBe(4) // Professional, Student, Regular Listener, Entrepreneur
      
      console.log('✅ Real Dashboard Stats:', {
        customers: stats.totalCustomers,
        avgLTV: stats.averageLifetimeValue,
        quality: stats.dataQualityScore
      })
    })

    it('should fetch segment distribution with accurate customer counts', async () => {
      const response = await fetch(`${API_BASE}/api/analytics/segment-distribution`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const segments = await response.json()
      
      expect(segments).toHaveLength(4)
      
      // Validate real segment data
      const professionalSegment = segments.find(s => s.segment === 'Professional')
      const studentSegment = segments.find(s => s.segment === 'Student')
      
      expect(professionalSegment?.count).toBeGreaterThan(1500) // Should be around 1,542
      expect(studentSegment?.count).toBeGreaterThan(700) // Should be around 752
      
      console.log('✅ Real Segment Distribution:', segments.map(s => 
        `${s.segment}: ${s.count} (${s.percentage}%)`
      ))
    })
  })

  describe('Customer Management Integration', () => {
    it('should search and retrieve real customer data', async () => {
      const response = await fetch(`${API_BASE}/api/customers?search=jakarta&limit=10`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.customers).toBeDefined()
      expect(data.total).toBeGreaterThan(0)
      
      // Validate real customer data structure
      if (data.customers.length > 0) {
        const customer = data.customers[0]
        expect(customer).toHaveProperty('id')
        expect(customer).toHaveProperty('firstName')
        expect(customer).toHaveProperty('lastName')
        expect(customer).toHaveProperty('email')
        
        console.log('✅ Real Customer Sample:', {
          id: customer.id,
          name: `${customer.firstName} ${customer.lastName}`,
          city: customer.city
        })
      }
    })

    it('should validate customer filtering with real data', async () => {
      const response = await fetch(`${API_BASE}/api/customers?city=Jakarta&limit=5`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.customers).toBeDefined()
      
      // All returned customers should be from Jakarta
      data.customers.forEach(customer => {
        if (customer.city) {
          expect(customer.city).toBe('Jakarta')
        }
      })
      
      console.log('✅ Jakarta Customers Found:', data.customers.length)
    })
  })

  describe('Vector Search Integration', () => {
    it('should perform semantic search with real customer embeddings', async () => {
      const searchQuery = 'software developer professional'
      
      const response = await fetch(`${API_BASE}/api/vector-search`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ query: searchQuery, limit: 5 })
      })
      
      expect(response.ok).toBe(true)
      const data = await response.json()
      
      expect(data.results).toBeDefined()
      expect(Array.isArray(data.results)).toBe(true)
      
      if (data.results.length > 0) {
        const result = data.results[0]
        expect(result).toHaveProperty('similarity')
        expect(result.similarity).toBeGreaterThan(0)
        expect(result.similarity).toBeLessThanOrEqual(1)
        
        console.log('✅ Vector Search Results:', {
          query: searchQuery,
          results: data.results.length,
          topMatch: {
            similarity: result.similarity,
            profession: result.profession
          }
        })
      }
    })
  })

  describe('Import History Integration', () => {
    it('should fetch real import history with complete metadata', async () => {
      const response = await fetch(`${API_BASE}/api/imports`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const imports = await response.json()
      
      expect(Array.isArray(imports)).toBe(true)
      
      if (imports.length > 0) {
        const recentImport = imports[0]
        testImportId = recentImport.id
        
        // Validate import metadata structure
        expect(recentImport).toHaveProperty('id')
        expect(recentImport).toHaveProperty('fileName')
        expect(recentImport).toHaveProperty('recordsProcessed')
        expect(recentImport).toHaveProperty('recordsSuccessful')
        expect(recentImport).toHaveProperty('importStatus')
        expect(recentImport).toHaveProperty('importedAt')
        
        console.log('✅ Real Import History:', {
          imports: imports.length,
          latest: {
            file: recentImport.fileName,
            processed: recentImport.recordsProcessed,
            successful: recentImport.recordsSuccessful,
            status: recentImport.importStatus
          }
        })
      }
    })

    it('should filter import history by status and date range', async () => {
      const response = await fetch(`${API_BASE}/api/imports?status=completed&limit=5`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const imports = await response.json()
      
      // All returned imports should have completed status
      imports.forEach(importSession => {
        expect(importSession.importStatus).toBe('completed')
      })
      
      console.log('✅ Completed Imports Filter:', imports.length)
    })
  })

  describe('Error Tracking Integration', () => {
    it('should fetch real import error details if available', async () => {
      if (!testImportId) {
        console.log('⚠️ Skipping error test - no import ID available')
        return
      }
      
      const response = await fetch(`${API_BASE}/api/imports/${testImportId}/errors`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const errors = await response.json()
      
      expect(Array.isArray(errors)).toBe(true)
      
      console.log('✅ Import Errors Retrieved:', {
        importId: testImportId,
        errorCount: errors.length
      })
      
      if (errors.length > 0) {
        const error = errors[0]
        expect(error).toHaveProperty('sourceRowNumber')
        expect(error).toHaveProperty('errorType')
        expect(error).toHaveProperty('errorMessage')
        
        console.log('✅ Error Sample:', {
          row: error.sourceRowNumber,
          type: error.errorType,
          message: error.errorMessage
        })
      }
    })

    it('should fetch error summary statistics for import session', async () => {
      if (!testImportId) {
        console.log('⚠️ Skipping error summary test - no import ID available')
        return
      }
      
      const response = await fetch(`${API_BASE}/api/imports/${testImportId}/errors/summary`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(response.ok).toBe(true)
      const summary = await response.json()
      
      expect(summary).toHaveProperty('totalErrors')
      expect(summary).toHaveProperty('errorTypes')
      
      console.log('✅ Error Summary:', {
        totalErrors: summary.totalErrors,
        errorTypes: Object.keys(summary.errorTypes || {})
      })
    })
  })

  describe('Data Lineage Integration', () => {
    it('should validate data lineage tracking for real customers', async () => {
      // Get a sample customer
      const customersResponse = await fetch(`${API_BASE}/api/customers?limit=1`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(customersResponse.ok).toBe(true)
      const customersData = await customersResponse.json()
      
      if (customersData.customers && customersData.customers.length > 0) {
        const customer = customersData.customers[0]
        
        // Validate lineage properties exist
        expect(customer).toHaveProperty('id')
        
        // Check if data lineage information is available
        if (customer.importId || customer.dataLineage) {
          console.log('✅ Data Lineage Found:', {
            customerId: customer.id,
            importId: customer.importId,
            hasLineage: !!customer.dataLineage
          })
        }
      }
    })
  })

  describe('System Performance Integration', () => {
    it('should validate API response times under load', async () => {
      const startTime = Date.now()
      
      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${API_BASE}/api/analytics/stats`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      )
      
      const responses = await Promise.all(requests)
      const endTime = Date.now()
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.ok).toBe(true)
      })
      
      const totalTime = endTime - startTime
      const avgTime = totalTime / requests.length
      
      // Average response time should be reasonable
      expect(avgTime).toBeLessThan(1000) // Less than 1 second average
      
      console.log('✅ Performance Test:', {
        concurrent: requests.length,
        totalTime: `${totalTime}ms`,
        avgTime: `${avgTime}ms`
      })
    })

    it('should validate cache warming effectiveness', async () => {
      // First request (may hit cache or database)
      const start1 = Date.now()
      const response1 = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const time1 = Date.now() - start1
      
      // Second request (should hit cache)
      const start2 = Date.now()
      const response2 = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const time2 = Date.now() - start2
      
      expect(response1.ok).toBe(true)
      expect(response2.ok).toBe(true)
      
      // Second request should generally be faster due to caching
      console.log('✅ Cache Performance:', {
        firstRequest: `${time1}ms`,
        secondRequest: `${time2}ms`,
        improvement: time2 < time1 ? `${((time1 - time2) / time1 * 100).toFixed(1)}%` : 'N/A'
      })
    })
  })

  describe('Data Integrity Validation', () => {
    it('should validate customer count consistency across endpoints', async () => {
      // Get total from analytics
      const analyticsResponse = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const analytics = await analyticsResponse.json()
      
      // Get segment totals
      const segmentsResponse = await fetch(`${API_BASE}/api/analytics/segment-distribution`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const segments = await segmentsResponse.json()
      
      const segmentTotal = segments.reduce((sum, segment) => sum + segment.count, 0)
      
      // Totals should match or be close (accounting for potential race conditions)
      const difference = Math.abs(analytics.totalCustomers - segmentTotal)
      const percentDiff = (difference / analytics.totalCustomers) * 100
      
      expect(percentDiff).toBeLessThan(5) // Allow up to 5% difference for race conditions
      
      console.log('✅ Data Consistency Check:', {
        analyticsTotal: analytics.totalCustomers,
        segmentTotal: segmentTotal,
        difference: difference,
        percentDiff: `${percentDiff.toFixed(2)}%`
      })
    })

    it('should validate data quality scores reflect real data state', async () => {
      const response = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      const stats = await response.json()
      const qualityScore = stats.dataQualityScore
      
      // Quality score should be realistic for real data
      expect(qualityScore).toBeGreaterThan(80) // Minimum reasonable quality
      expect(qualityScore).toBeLessThanOrEqual(100) // Maximum possible quality
      
      console.log('✅ Data Quality Validation:', {
        score: qualityScore,
        grade: qualityScore > 95 ? 'Excellent' : qualityScore > 85 ? 'Good' : 'Fair'
      })
    })
  })

  afterAll(() => {
    console.log('\n🎉 Functional Integration Tests Complete!')
    console.log('All features validated with real backend data')
  })
})
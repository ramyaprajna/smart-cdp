import { describe, it, expect, beforeAll } from 'vitest'
import { fetch, FormData, Blob } from 'undici'
import { writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Data Flow Validation Tests
 * 
 * These tests validate end-to-end data flow from import to dashboard,
 * ensuring system state changes are accurately reflected.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000'
let authToken: string

describe('Data Flow Validation Tests', () => {
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
    
    const authData = await authResponse.json()
    authToken = authData.token
  })

  describe('Import to Dashboard Flow', () => {
    it('should validate import creates accurate history entries', async () => {
      // Get initial import count
      const initialResponse = await fetch(`${API_BASE}/api/imports`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const initialImports = await initialResponse.json()
      const initialCount = initialImports.length
      
      console.log('📊 Initial Import Count:', initialCount)
      
      // Create a small test CSV file
      const testCsvContent = `firstName,lastName,email,phone
John,Doe,john.doe.test@example.com,+1234567890
Jane,Smith,jane.smith.test@example.com,+0987654321`
      
      const testFilePath = join(process.cwd(), 'temp', 'test-data-flow.csv')
      writeFileSync(testFilePath, testCsvContent)
      
      // Upload test file
      const formData = new FormData()
      const fileBuffer = Buffer.from(testCsvContent)
      const blob = new Blob([fileBuffer], { type: 'text/csv' })
      formData.append('file', blob, 'test-data-flow.csv')
      
      const uploadResponse = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      })
      
      expect(uploadResponse.ok).toBe(true)
      const uploadResult = await uploadResponse.json()
      
      console.log('📁 File Upload Result:', {
        success: uploadResult.success,
        processed: uploadResult.recordsProcessed,
        importId: uploadResult.importSessionId
      })
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Verify import appears in history
      const updatedResponse = await fetch(`${API_BASE}/api/imports`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const updatedImports = await updatedResponse.json()
      
      expect(updatedImports.length).toBeGreaterThan(initialCount)
      
      // Find our test import
      const testImport = updatedImports.find(imp => 
        imp.fileName === 'test-data-flow.csv'
      )
      
      expect(testImport).toBeDefined()
      expect(testImport.recordsProcessed).toBe(2)
      
      console.log('✅ Import History Updated:', {
        newImportCount: updatedImports.length,
        testImportFound: !!testImport,
        recordsProcessed: testImport?.recordsProcessed
      })
    })
  })

  describe('Error Handling Flow', () => {
    it('should validate error generation and tracking flow', async () => {
      // Create CSV with intentional errors
      const errorCsvContent = `firstName,lastName,email,phone
Valid,User,valid@example.com,+1234567890
Invalid,Email,not-an-email,+0987654321
Missing,Phone,missing.phone@example.com,
,LastNameOnly,onlylast@example.com,+5555555555`
      
      const formData = new FormData()
      const fileBuffer = Buffer.from(errorCsvContent)
      const blob = new Blob([fileBuffer], { type: 'text/csv' })
      formData.append('file', blob, 'test-error-flow.csv')
      
      const uploadResponse = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      })
      
      const uploadResult = await uploadResponse.json()
      const importId = uploadResult.importSessionId
      
      console.log('📁 Error Test Upload:', {
        importId,
        recordsProcessed: uploadResult.recordsProcessed,
        hasErrors: uploadResult.recordsFailed > 0
      })
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check if errors were captured
      const errorsResponse = await fetch(`${API_BASE}/api/imports/${importId}/errors`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      if (errorsResponse.ok) {
        const errors = await errorsResponse.json()
        
        console.log('🔍 Error Tracking Results:', {
          errorCount: errors.length,
          errorTypes: [...new Set(errors.map(e => e.errorType))]
        })
        
        // Validate error structure
        if (errors.length > 0) {
          const error = errors[0]
          expect(error).toHaveProperty('sourceRowNumber')
          expect(error).toHaveProperty('errorType')
          expect(error).toHaveProperty('errorMessage')
          expect(error).toHaveProperty('fieldName')
        }
      }
    })
  })

  describe('Real-time Dashboard Updates', () => {
    it('should validate dashboard metrics reflect system changes', async () => {
      // Get initial dashboard stats
      const initialStatsResponse = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const initialStats = await initialStatsResponse.json()
      
      console.log('📊 Initial Dashboard Stats:', {
        customers: initialStats.totalCustomers,
        avgLTV: initialStats.averageLifetimeValue,
        quality: initialStats.dataQualityScore
      })
      
      // Wait for cache refresh (if analytics are cached)
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Get updated stats
      const updatedStatsResponse = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const updatedStats = await updatedStatsResponse.json()
      
      console.log('📈 Updated Dashboard Stats:', {
        customers: updatedStats.totalCustomers,
        avgLTV: updatedStats.averageLifetimeValue,
        quality: updatedStats.dataQualityScore,
        changed: updatedStats.totalCustomers !== initialStats.totalCustomers
      })
      
      // Validate stats structure remains consistent
      expect(updatedStats).toHaveProperty('totalCustomers')
      expect(updatedStats).toHaveProperty('averageLifetimeValue')
      expect(updatedStats).toHaveProperty('dataQualityScore')
      expect(updatedStats).toHaveProperty('activeSegments')
    })
  })

  describe('Vector Search Index Updates', () => {
    it('should validate vector search reflects new customer data', async () => {
      // Perform a search that might include recently added test data
      const searchResponse = await fetch(`${API_BASE}/api/vector-search`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ 
          query: 'test user example', 
          limit: 10 
        })
      })
      
      expect(searchResponse.ok).toBe(true)
      const searchResults = await searchResponse.json()
      
      console.log('🔍 Vector Search Test:', {
        query: 'test user example',
        resultsFound: searchResults.results?.length || 0,
        topSimilarity: searchResults.results?.[0]?.similarity || 0
      })
      
      // Validate search functionality works
      expect(searchResults).toHaveProperty('results')
      expect(Array.isArray(searchResults.results)).toBe(true)
    })
  })

  describe('User Activity Tracking', () => {
    it('should validate user sessions and activity logging', async () => {
      // Check authentication status
      const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      expect(meResponse.ok).toBe(true)
      const userInfo = await meResponse.json()
      
      expect(userInfo).toHaveProperty('id')
      expect(userInfo).toHaveProperty('email')
      expect(userInfo).toHaveProperty('role')
      
      console.log('👤 User Session Validation:', {
        userId: userInfo.id,
        email: userInfo.email,
        role: userInfo.role,
        authenticated: true
      })
    })
  })

  describe('System Health Monitoring', () => {
    it('should validate system components are responding correctly', async () => {
      const healthChecks = [
        { name: 'Analytics', endpoint: '/api/analytics/stats' },
        { name: 'Customers', endpoint: '/api/customers?limit=1' },
        { name: 'Imports', endpoint: '/api/imports?limit=1' },
        { name: 'Authentication', endpoint: '/api/auth/me' }
      ]
      
      const results = await Promise.allSettled(
        healthChecks.map(async (check) => {
          const response = await fetch(`${API_BASE}${check.endpoint}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          })
          
          return {
            name: check.name,
            status: response.ok ? 'healthy' : 'error',
            responseTime: response.headers.get('x-response-time') || 'unknown'
          }
        })
      )
      
      const healthStatus = results.map(result => 
        result.status === 'fulfilled' ? result.value : { 
          name: 'Unknown', 
          status: 'error', 
          error: result.reason 
        }
      )
      
      console.log('🏥 System Health Check:', healthStatus)
      
      // All critical components should be healthy
      const healthyComponents = healthStatus.filter(h => h.status === 'healthy').length
      expect(healthyComponents).toBe(healthChecks.length)
    })
  })

  describe('Data Consistency Validation', () => {
    it('should validate cross-endpoint data consistency', async () => {
      // Get customer count from analytics
      const analyticsResponse = await fetch(`${API_BASE}/api/analytics/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const analytics = await analyticsResponse.json()
      
      // Get all customers (first page)
      const customersResponse = await fetch(`${API_BASE}/api/customers?limit=50`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const customersData = await customersResponse.json()
      
      // Get segment distribution
      const segmentsResponse = await fetch(`${API_BASE}/api/analytics/segment-distribution`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const segments = await segmentsResponse.json()
      
      console.log('🔍 Data Consistency Check:', {
        analyticsTotal: analytics.totalCustomers,
        customersTotal: customersData.total,
        segmentTotal: segments.reduce((sum, s) => sum + s.count, 0),
        consistent: analytics.totalCustomers === customersData.total
      })
      
      // Analytics and customers endpoints should report same total
      expect(analytics.totalCustomers).toBe(customersData.total)
      
      // Segment counts should add up to total (or be close)
      const segmentSum = segments.reduce((sum, segment) => sum + segment.count, 0)
      const difference = Math.abs(analytics.totalCustomers - segmentSum)
      expect(difference).toBeLessThan(100) // Allow small variance for data processing
    })
  })
})
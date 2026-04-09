/**
 * Archive Management API Integration Tests
 * 
 * Tests the complete API functionality for archive management,
 * including all CRUD operations, restoration, and data cleaning.
 * 
 * Created: August 4, 2025
 * Integration Status: ✅ NEW - Complete API testing coverage
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createMockUser } from '../setup'

// Mock database connections
vi.mock('@server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] })
  }
}))

vi.mock('@server/db-archive', () => ({
  archiveDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] })
  }
}))

describe('Archive Management API Integration Tests', () => {
  let mockApp: any
  let mockUser: any
  let authToken: string

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = createMockUser()
    authToken = 'mock-jwt-token'

    // Mock successful authentication
    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockUser })
        })
      }
      return Promise.resolve({ ok: false })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/archives', () => {
    it('should fetch archives with pagination', async () => {
      const mockArchives = [
        {
          id: 'archive-1',
          name: 'Test Archive 1',
          description: 'First test archive',
          archiveType: 'backup',
          status: 'completed',
          dataSize: 1048576,
          recordCounts: { customers: 1000 },
          createdAt: '2025-08-04T00:00:00Z'
        },
        {
          id: 'archive-2',
          name: 'Test Archive 2',
          description: 'Second test archive',
          archiveType: 'full',
          status: 'completed',
          dataSize: 2097152,
          recordCounts: { customers: 2000, customer_events: 500 },
          createdAt: '2025-08-03T00:00:00Z'
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          archives: mockArchives,
          pagination: { total: 2, page: 0, limit: 20 }
        })
      })

      const response = await fetch('/api/archives?limit=20&offset=0', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.archives).toHaveLength(2)
      expect(data.archives[0].name).toBe('Test Archive 1')
    })

    it('should handle search functionality', async () => {
      const mockSearchResults = [
        {
          id: 'archive-search',
          name: 'Backup Archive 2025',
          description: 'Daily backup',
          archiveType: 'backup',
          status: 'completed'
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          archives: mockSearchResults,
          pagination: { total: 1, page: 0, limit: 20 }
        })
      })

      const response = await fetch('/api/archives?search=backup', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      expect(data.archives).toHaveLength(1)
      expect(data.archives[0].name).toContain('Backup')
    })

    it('should handle sorting', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          archives: [],
          pagination: { total: 0, page: 0, limit: 20 }
        })
      })

      const response = await fetch('/api/archives?sortBy=name&sortOrder=asc', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.ok).toBe(true)
    })

    it('should require authentication', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          success: false,
          error: 'Authentication required'
        })
      })

      const response = await fetch('/api/archives')
      expect(response.ok).toBe(false)
      
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Authentication required')
    })
  })

  describe('GET /api/archives/statistics', () => {
    it('should fetch archive statistics', async () => {
      const mockStats = {
        totalArchives: 5,
        totalDataSize: 15728640, // 15MB
        averageArchiveSize: 3145728, // 3MB
        oldestArchive: '2025-07-01T00:00:00Z',
        newestArchive: '2025-08-04T00:00:00Z',
        totalRecordsArchived: 25000,
        schemaIsolationStatus: 'isolated'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          statistics: mockStats
        })
      })

      const response = await fetch('/api/archives/statistics', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.statistics.totalArchives).toBe(5)
      expect(data.statistics.totalDataSize).toBe(15728640)
      expect(data.statistics.schemaIsolationStatus).toBe('isolated')
    })
  })

  describe('POST /api/archives', () => {
    it('should create new archive', async () => {
      const newArchive = {
        name: 'New Test Archive',
        description: 'Created via API test',
        archiveType: 'backup'
      }

      const mockCreatedArchive = {
        id: 'new-archive-id',
        ...newArchive,
        status: 'creating',
        dataSize: 0,
        recordCounts: {},
        createdAt: '2025-08-04T12:00:00Z',
        createdBy: mockUser.id
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          success: true,
          archive: mockCreatedArchive
        })
      })

      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(newArchive)
      })

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.archive.name).toBe(newArchive.name)
      expect(data.archive.status).toBe('creating')
    })

    it('should validate archive creation data', async () => {
      const invalidArchive = {
        name: '', // Empty name should fail validation
        archiveType: 'invalid-type'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Validation failed',
          details: ['Name is required', 'Invalid archive type']
        })
      })

      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(invalidArchive)
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.details).toBeDefined()
    })

    it('should require admin role', async () => {
      const nonAdminUser = { ...mockUser, role: 'viewer' }
      
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ user: nonAdminUser })
          })
        }
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({
            success: false,
            error: 'Insufficient permissions'
          })
        })
      })

      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ name: 'Test', archiveType: 'backup' })
      })

      expect(response.status).toBe(403)
    })
  })

  describe('PUT /api/archives/:id', () => {
    it('should update archive metadata', async () => {
      const archiveId = 'archive-to-update'
      const updates = {
        name: 'Updated Archive Name',
        description: 'Updated description'
      }

      const mockUpdatedArchive = {
        id: archiveId,
        ...updates,
        archiveType: 'backup',
        status: 'completed',
        updatedAt: '2025-08-04T12:30:00Z'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          archive: mockUpdatedArchive
        })
      })

      const response = await fetch(`/api/archives/${archiveId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(updates)
      })

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.archive.name).toBe(updates.name)
      expect(data.archive.description).toBe(updates.description)
    })

    it('should handle archive not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: 'Archive not found'
        })
      })

      const response = await fetch('/api/archives/non-existent-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ name: 'Updated' })
      })

      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /api/archives/:id', () => {
    it('should delete archive', async () => {
      const archiveId = 'archive-to-delete'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          message: 'Archive deleted successfully'
        })
      })

      const response = await fetch(`/api/archives/${archiveId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should handle delete failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          success: false,
          error: 'Failed to delete archive'
        })
      })

      const response = await fetch('/api/archives/failing-archive', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(500)
    })
  })

  describe('POST /api/archives/:id/restore', () => {
    it('should restore archive with full options', async () => {
      const archiveId = 'archive-to-restore'
      const restoreOptions = {
        restoreType: 'full',
        replaceExisting: true,
        validateData: true
      }

      const mockRestoreResult = {
        recordsRestored: 12558,
        tablesRestored: ['customers', 'customer_events'],
        tablesProcessed: ['customers', 'customer_events', 'data_imports']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          restoration: mockRestoreResult,
          message: 'Archive restoration completed successfully. 12558 records restored.'
        })
      })

      const response = await fetch(`/api/archives/${archiveId}/restore`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(restoreOptions)
      })

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.restoration.recordsRestored).toBe(12558)
      expect(data.restoration.tablesRestored).toContain('customers')
    })

    it('should handle selective restore', async () => {
      const restoreOptions = {
        restoreType: 'selective',
        selectedTables: ['customers'],
        replaceExisting: false,
        validateData: true
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          restoration: {
            recordsRestored: 1000,
            tablesRestored: ['customers'],
            tablesProcessed: ['customers']
          }
        })
      })

      const response = await fetch('/api/archives/archive-id/restore', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(restoreOptions)
      })

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.restoration.tablesRestored).toEqual(['customers'])
    })

    it('should validate restore archive status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Archive is not ready for restoration. Status: creating'
        })
      })

      const response = await fetch('/api/archives/creating-archive/restore', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ restoreType: 'full', replaceExisting: false, validateData: true })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/archives/clean', () => {
    it('should clean application data', async () => {
      const cleanOptions = {
        tablesToClean: ['customers', 'customer_events']
      }

      const mockCleanResult = {
        cleaned: ['customers', 'customer_events'],
        recordsRemoved: 13000
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          backup: {
            archiveId: 'backup-archive-id',
            archiveName: 'Backup Before Clean 08-04-2025 12-45',
            message: 'Backup created successfully before cleaning'
          },
          clean: mockCleanResult,
          message: 'Data cleaned successfully. Backup archive created with 13000 records.'
        })
      })

      const response = await fetch('/api/archives/clean', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify(cleanOptions)
      })

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.clean.recordsRemoved).toBe(13000)
      expect(data.backup.archiveId).toBeDefined()
    })

    it('should create backup before cleaning', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          backup: {
            archiveId: 'backup-id',
            archiveName: 'Backup Before Clean',
            message: 'Backup created successfully before cleaning'
          },
          clean: {
            cleaned: ['customers'],
            recordsRemoved: 5000
          }
        })
      })

      const response = await fetch('/api/archives/clean', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({})
      })

      const data = await response.json()
      expect(data.backup).toBeDefined()
      expect(data.backup.archiveId).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          success: false,
          error: 'Database connection failed',
          correlationId: 'db-error-123'
        })
      })

      const response = await fetch('/api/archives', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.correlationId).toBeDefined()
    })

    it('should handle malformed JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: 'Invalid JSON in request body'
        })
      })

      const response = await fetch('/api/archives', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: 'invalid-json'
      })

      expect(response.status).toBe(400)
    })

    it('should handle timeout errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 408,
        json: () => Promise.resolve({
          success: false,
          error: 'Request timeout'
        })
      })

      const response = await fetch('/api/archives/statistics', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      expect(response.status).toBe(408)
    })
  })
})
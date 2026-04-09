/**
 * Archive Management Unit Tests
 * 
 * Comprehensive unit tests for the archive management functionality.
 * Tests the useArchiveManagement hook, utility functions, and core logic.
 * 
 * Created: August 4, 2025
 * Integration Status: ✅ NEW - Complete archive module testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useArchiveManagement } from '@/hooks/use-archive-management'
import { createMockUser } from '../setup'

// Mock the API client
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
}))

describe('Archive Management Hook', () => {
  let queryClient: QueryClient
  let wrapper: any

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    wrapper = ({ children }: { children: any }) => 
      createElement(QueryClientProvider, { client: queryClient }, children)
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('Hook Initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(result.current.archives).toEqual([])
      expect(result.current.totalArchives).toBe(0)
      expect(result.current.statistics).toBeUndefined()
      expect(result.current.currentPage).toBe(0)
      expect(result.current.pageSize).toBe(20)
      expect(result.current.searchQuery).toBe('')
      expect(result.current.sortBy).toBe('created_at')
      expect(result.current.sortOrder).toBe('desc')
    })

    it('should provide all required functions', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(typeof result.current.createArchive).toBe('function')
      expect(typeof result.current.updateArchive).toBe('function')
      expect(typeof result.current.deleteArchive).toBe('function')
      expect(typeof result.current.restoreArchive).toBe('function')
      expect(typeof result.current.cleanApplicationData).toBe('function')
      expect(typeof result.current.formatFileSize).toBe('function')
      expect(typeof result.current.getArchiveStatusColor).toBe('function')
      expect(typeof result.current.getArchiveTypeLabel).toBe('function')
    })
  })

  describe('Utility Functions', () => {
    it('should format file sizes correctly', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(result.current.formatFileSize(0)).toBe('0 B')
      expect(result.current.formatFileSize(1024)).toBe('1 KB')
      expect(result.current.formatFileSize(1048576)).toBe('1 MB')
      expect(result.current.formatFileSize(1073741824)).toBe('1 GB')
      expect(result.current.formatFileSize(2560)).toBe('2.5 KB')
      expect(result.current.formatFileSize(3047424)).toBe('2.91 MB')
    })

    it('should return correct archive status colors', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(result.current.getArchiveStatusColor('completed')).toBe('text-green-600')
      expect(result.current.getArchiveStatusColor('creating')).toBe('text-blue-600')
      expect(result.current.getArchiveStatusColor('failed')).toBe('text-red-600')
      expect(result.current.getArchiveStatusColor('restored')).toBe('text-purple-600')
      expect(result.current.getArchiveStatusColor('unknown' as any)).toBe('text-gray-600')
    })

    it('should return correct archive type labels', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(result.current.getArchiveTypeLabel('full')).toBe('Full Archive')
      expect(result.current.getArchiveTypeLabel('partial')).toBe('Partial Archive')
      expect(result.current.getArchiveTypeLabel('backup')).toBe('Backup Archive')
      expect(result.current.getArchiveTypeLabel('unknown' as any)).toBe('Unknown')
    })
  })

  describe('Search and Pagination', () => {
    it('should update search query and reset page', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      act(() => {
        result.current.goToPage(2)
      })
      expect(result.current.currentPage).toBe(2)

      act(() => {
        result.current.updateSearch('test search')
      })
      expect(result.current.searchQuery).toBe('test search')
      expect(result.current.currentPage).toBe(0) // Should reset to first page
    })

    it('should update sorting and reset page', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      act(() => {
        result.current.goToPage(3)
      })
      expect(result.current.currentPage).toBe(3)

      act(() => {
        result.current.updateSorting('name', 'asc')
      })
      expect(result.current.sortBy).toBe('name')
      expect(result.current.sortOrder).toBe('asc')
      expect(result.current.currentPage).toBe(0) // Should reset to first page
    })

    it('should change page size and reset page', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      act(() => {
        result.current.goToPage(2)
      })
      expect(result.current.currentPage).toBe(2)

      act(() => {
        result.current.changePageSize(50)
      })
      expect(result.current.pageSize).toBe(50)
      expect(result.current.currentPage).toBe(0) // Should reset to first page
    })

    it('should navigate to specific page', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      act(() => {
        result.current.goToPage(5)
      })
      expect(result.current.currentPage).toBe(5)
    })
  })

  describe('Archive Operations', () => {
    it('should create archive with correct parameters', async () => {
      const mockApiRequest = vi.fn().mockResolvedValue({
        success: true,
        archive: { id: 'new-archive-id', name: 'Test Archive' }
      })
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      const archiveOptions = {
        name: 'Test Archive',
        description: 'Test Description',
        archiveType: 'backup' as const
      }

      await act(async () => {
        await result.current.createArchive(archiveOptions)
      })

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/archives', archiveOptions)
    })

    it('should update archive with correct parameters', async () => {
      const mockApiRequest = vi.fn().mockResolvedValue({
        success: true,
        archive: { id: 'archive-id', name: 'Updated Archive' }
      })
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      const updates = {
        name: 'Updated Archive',
        description: 'Updated Description'
      }

      await act(async () => {
        await result.current.updateArchive('archive-id', updates)
      })

      expect(mockApiRequest).toHaveBeenCalledWith('PUT', '/api/archives/archive-id', updates)
    })

    it('should restore archive with correct options', async () => {
      const mockApiRequest = vi.fn().mockResolvedValue({
        success: true,
        restoration: { recordsRestored: 1000, tablesRestored: ['customers'] }
      })
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      const restoreOptions = {
        restoreType: 'full' as const,
        replaceExisting: true,
        validateData: true
      }

      await act(async () => {
        await result.current.restoreArchive('archive-id', restoreOptions)
      })

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/archives/archive-id/restore', restoreOptions)
    })

    it('should delete archive', async () => {
      const mockApiRequest = vi.fn().mockResolvedValue({
        success: true
      })
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      await act(async () => {
        await result.current.deleteArchive('archive-id')
      })

      expect(mockApiRequest).toHaveBeenCalledWith('DELETE', '/api/archives/archive-id')
    })

    it('should clean application data', async () => {
      const mockApiRequest = vi.fn().mockResolvedValue({
        success: true,
        cleaned: ['customers', 'customer_events'],
        recordsRemoved: 12558
      })
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      await act(async () => {
        await result.current.cleanApplicationData(['customers'])
      })

      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/archives/clean', { tablesToClean: ['customers'] })
    })
  })

  describe('Loading States', () => {
    it('should track loading states correctly', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(typeof result.current.isLoadingArchives).toBe('boolean')
      expect(typeof result.current.isLoadingStats).toBe('boolean')
      expect(typeof result.current.isCreating).toBe('boolean')
      expect(typeof result.current.isUpdating).toBe('boolean')
      expect(typeof result.current.isDeleting).toBe('boolean')
      expect(typeof result.current.isRestoring).toBe('boolean')
      expect(typeof result.current.isCleaning).toBe('boolean')
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockApiRequest = vi.fn().mockRejectedValue(new Error('API Error'))
      
      vi.doMock('@/lib/queryClient', () => ({
        apiRequest: mockApiRequest
      }))

      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      await expect(
        act(async () => {
          await result.current.createArchive({ name: 'Test', archiveType: 'backup' })
        })
      ).rejects.toThrow('API Error')
    })

    it('should provide error states', () => {
      const { result } = renderHook(() => useArchiveManagement(), { wrapper })

      expect(result.current.archivesError).toBeDefined()
      expect(result.current.createError).toBeDefined()
      expect(result.current.updateError).toBeDefined()
      expect(result.current.deleteError).toBeDefined()
      expect(result.current.restoreError).toBeDefined()
      expect(result.current.cleanError).toBeDefined()
    })
  })
})
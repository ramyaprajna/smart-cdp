/**
 * Archive Management Component Tests
 * 
 * Tests React components for archive management including:
 * - Main ArchiveManagement component
 * - Archive dialogs (Create, Edit, Restore)
 * - Archive statistics display
 * - Archive item cards
 * 
 * Created: August 4, 2025
 * Integration Status: ✅ NEW - Complete UI component testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ArchiveManagement from '@/pages/archive-management'
import { createMockUser } from '../setup'

// Mock the useArchiveManagement hook
const mockUseArchiveManagement = vi.fn()
const mockToast = vi.fn()

vi.mock('@/hooks/use-archive-management', () => ({
  useArchiveManagement: () => mockUseArchiveManagement()
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}))

// Mock Lucide React icons - use importOriginal to get all icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    // Keep all original exports, they work fine for testing
  }
})

describe('Archive Management Components', () => {
  let queryClient: QueryClient
  let user: ReturnType<typeof userEvent.setup>

  const mockArchive = {
    id: 'test-archive-1',
    name: 'Test Archive',
    description: 'Test archive description',
    archiveType: 'backup',
    status: 'completed',
    dataSize: 3047424,
    recordCounts: { customers: 12558, data_imports: 1 },
    createdAt: '2025-08-04T02:23:02.683482+00:00',
    createdBy: 'test-user',
    restoredAt: null
  }

  const mockStatistics = {
    totalArchives: 1,
    totalDataSize: 3047424,
    averageArchiveSize: 3047424,
    oldestArchive: '2025-08-04T02:23:02.683482+00:00',
    newestArchive: '2025-08-04T02:23:02.683482+00:00',
    totalRecordsArchived: 12559,
    schemaIsolationStatus: 'isolated'
  }

  const mockHookReturn = {
    archives: [mockArchive],
    totalArchives: 1,
    statistics: mockStatistics,
    isLoadingArchives: false,
    isLoadingStats: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    isRestoring: false,
    isCleaning: false,
    archivesError: null,
    createError: null,
    updateError: null,
    deleteError: null,
    restoreError: null,
    cleanError: null,
    currentPage: 0,
    totalPages: 1,
    searchQuery: '',
    updateSearch: vi.fn(),
    goToPage: vi.fn(),
    deleteArchive: vi.fn(),
    restoreArchive: vi.fn(),
    updateArchive: vi.fn(),
    createArchive: vi.fn(),
    cleanApplicationData: vi.fn(),
    refetchArchives: vi.fn(),
    refetchStats: vi.fn(),
    formatFileSize: (bytes: number) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },
    getArchiveStatusColor: (status: string) => 'text-green-600',
    getArchiveTypeLabel: (type: string) => 'Backup Archive'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseArchiveManagement.mockReturnValue(mockHookReturn)

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    user = userEvent.setup()

    // Mock window.confirm
    Object.defineProperty(window, 'confirm', { 
      value: vi.fn(() => true),
      writable: true 
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  describe('Main Archive Management Component', () => {
    it('should render main components', () => {
      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('Archive Management')).toBeInTheDocument()
      expect(screen.getByText('Manage data archives, backups, and restoration operations')).toBeInTheDocument()
      expect(screen.getByText('Clean Data')).toBeInTheDocument()
      expect(screen.getByText('Create Archive')).toBeInTheDocument()
    })

    it('should display archive statistics', () => {
      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('Archive Statistics')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument() // Total archives
      expect(screen.getByText('2.91 MB')).toBeInTheDocument() // Total size
      expect(screen.getByText('12,559')).toBeInTheDocument() // Records archived
    })

    it('should display archive items', () => {
      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('Test Archive')).toBeInTheDocument()
      expect(screen.getByText('Test archive description')).toBeInTheDocument()
      expect(screen.getByText('Backup Archive')).toBeInTheDocument()
      expect(screen.getByText('2.91 MB')).toBeInTheDocument()
      expect(screen.getByText('12,559')).toBeInTheDocument()
    })

    it('should display search functionality', () => {
      renderWithProviders(<ArchiveManagement />)

      const searchInput = screen.getByPlaceholderText('Search archives...')
      expect(searchInput).toBeInTheDocument()
    })

    it('should handle search input', async () => {
      renderWithProviders(<ArchiveManagement />)

      const searchInput = screen.getByPlaceholderText('Search archives...')
      await user.type(searchInput, 'test search')

      expect(mockHookReturn.updateSearch).toHaveBeenCalledWith('test search')
    })

    it('should show loading state', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        isLoadingArchives: true
      })

      renderWithProviders(<ArchiveManagement />)

      // Check for loading skeleton
      const skeletonElements = screen.getAllByRole('generic')
      expect(skeletonElements.length).toBeGreaterThan(0)
    })

    it('should show empty state when no archives', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        archives: [],
        totalArchives: 0
      })

      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('No archives found')).toBeInTheDocument()
      expect(screen.getByText('Create your first archive to get started')).toBeInTheDocument()
    })

    it('should show error state', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        archivesError: new Error('Failed to load archives')
      })

      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('Failed to load archives. Please check your permissions and try again.')).toBeInTheDocument()
    })
  })

  describe('Archive Item Card', () => {
    it('should display archive information correctly', () => {
      renderWithProviders(<ArchiveManagement />)

      // Check archive details
      expect(screen.getByText('Test Archive')).toBeInTheDocument()
      expect(screen.getByText('Test archive description')).toBeInTheDocument()
      expect(screen.getByText('Backup Archive')).toBeInTheDocument()
      expect(screen.getByText('2.91 MB')).toBeInTheDocument()
      expect(screen.getByText('12,559')).toBeInTheDocument()
      expect(screen.getByText('8/4/2025')).toBeInTheDocument()
    })

    it('should display action buttons', () => {
      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Restore')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /trash/i })).toBeInTheDocument()
    })

    it('should disable restore button for non-completed archives', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        archives: [{
          ...mockArchive,
          status: 'creating'
        }]
      })

      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore').closest('button')
      expect(restoreButton).toBeDisabled()
    })

    it('should show restored status', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        archives: [{
          ...mockArchive,
          restoredAt: '2025-08-04T12:00:00Z'
        }]
      })

      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText(/Restored on/)).toBeInTheDocument()
    })
  })

  describe('Archive Actions', () => {
    it('should handle edit archive', async () => {
      renderWithProviders(<ArchiveManagement />)

      const editButton = screen.getByText('Edit')
      await user.click(editButton)

      // Should open edit dialog
      expect(screen.getByText('Edit Archive')).toBeInTheDocument()
      expect(screen.getByText('Update archive name and description.')).toBeInTheDocument()
    })

    it('should handle restore archive', async () => {
      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      // Should open restore dialog
      expect(screen.getByText('Restore Archive')).toBeInTheDocument()
      expect(screen.getByText('Configure restoration options for the selected archive.')).toBeInTheDocument()
    })

    it('should handle delete archive with confirmation', async () => {
      renderWithProviders(<ArchiveManagement />)

      const deleteButton = screen.getByRole('button', { name: /trash/i })
      await user.click(deleteButton)

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this archive? This action cannot be undone.'
      )
      expect(mockHookReturn.deleteArchive).toHaveBeenCalledWith('test-archive-1')
    })

    it('should handle clean data with confirmation', async () => {
      renderWithProviders(<ArchiveManagement />)

      const cleanButton = screen.getByText('Clean Data')
      await user.click(cleanButton)

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to clean all application data? This will remove all current data and cannot be undone.'
      )
      expect(mockHookReturn.cleanApplicationData).toHaveBeenCalled()
    })
  })

  describe('Create Archive Dialog', () => {
    it('should open create archive dialog', async () => {
      renderWithProviders(<ArchiveManagement />)

      const createButton = screen.getByText('Create Archive')
      await user.click(createButton)

      expect(screen.getByText('Create New Archive')).toBeInTheDocument()
      expect(screen.getByText('Create a backup of current application data for restoration purposes.')).toBeInTheDocument()
    })

    it('should handle archive creation', async () => {
      renderWithProviders(<ArchiveManagement />)

      const createButton = screen.getByText('Create Archive')
      await user.click(createButton)

      // Fill form
      const nameInput = screen.getByLabelText('Archive Name')
      const descriptionInput = screen.getByLabelText('Description (Optional)')

      await user.type(nameInput, 'New Test Archive')
      await user.type(descriptionInput, 'Test description')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create Archive/i })
      await user.click(submitButton)

      expect(mockHookReturn.createArchive).toHaveBeenCalledWith({
        name: 'New Test Archive',
        description: 'Test description',
        archiveType: 'full'
      })
    })

    it('should generate automatic name when blank', async () => {
      renderWithProviders(<ArchiveManagement />)

      const createButton = screen.getByText('Create Archive')
      await user.click(createButton)

      // Leave name blank and submit
      const submitButton = screen.getByRole('button', { name: /Create Archive/i })
      await user.click(submitButton)

      expect(mockHookReturn.createArchive).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('Weekly Backup'),
          archiveType: 'full'
        })
      )
    })
  })

  describe('Edit Archive Dialog', () => {
    it('should pre-populate edit form', async () => {
      renderWithProviders(<ArchiveManagement />)

      const editButton = screen.getByText('Edit')
      await user.click(editButton)

      const nameInput = screen.getByDisplayValue('Test Archive')
      const descriptionInput = screen.getByDisplayValue('Test archive description')

      expect(nameInput).toBeInTheDocument()
      expect(descriptionInput).toBeInTheDocument()
    })

    it('should handle archive update', async () => {
      renderWithProviders(<ArchiveManagement />)

      const editButton = screen.getByText('Edit')
      await user.click(editButton)

      const nameInput = screen.getByDisplayValue('Test Archive')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Archive Name')

      const updateButton = screen.getByRole('button', { name: /Update Archive/i })
      await user.click(updateButton)

      expect(mockHookReturn.updateArchive).toHaveBeenCalledWith('test-archive-1', {
        name: 'Updated Archive Name',
        description: 'Test archive description'
      })
    })

    it('should disable update button when name is empty', async () => {
      renderWithProviders(<ArchiveManagement />)

      const editButton = screen.getByText('Edit')
      await user.click(editButton)

      const nameInput = screen.getByDisplayValue('Test Archive')
      await user.clear(nameInput)

      const updateButton = screen.getByRole('button', { name: /Update Archive/i })
      expect(updateButton).toBeDisabled()
    })
  })

  describe('Restore Archive Dialog', () => {
    it('should display restore options', async () => {
      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      expect(screen.getByText('Restore Type')).toBeInTheDocument()
      expect(screen.getByText('Replace existing data')).toBeInTheDocument()
      expect(screen.getByText('Validate data integrity')).toBeInTheDocument()
    })

    it('should handle restore options', async () => {
      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      // Check replace existing data
      const replaceCheckbox = screen.getByLabelText('Replace existing data')
      await user.click(replaceCheckbox)

      // Submit restore
      const restoreSubmitButton = screen.getByRole('button', { name: /Restore Archive/i })
      await user.click(restoreSubmitButton)

      expect(mockHookReturn.restoreArchive).toHaveBeenCalledWith('test-archive-1', {
        restoreType: 'full',
        replaceExisting: true,
        validateData: true
      })
    })

    it('should show warning for replace existing data', async () => {
      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      const replaceCheckbox = screen.getByLabelText('Replace existing data')
      await user.click(replaceCheckbox)

      expect(screen.getByText('Warning: This will permanently replace existing application data.')).toBeInTheDocument()
    })

    it('should change button variant for destructive operations', async () => {
      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      const replaceCheckbox = screen.getByLabelText('Replace existing data')
      await user.click(replaceCheckbox)

      const restoreSubmitButton = screen.getByRole('button', { name: /Restore Archive/i })
      expect(restoreSubmitButton).toHaveClass('bg-destructive') // Assuming destructive variant adds this class
    })
  })

  describe('Loading States', () => {
    it('should show creating state', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        isCreating: true
      })

      renderWithProviders(<ArchiveManagement />)
      
      const createButton = screen.getByText('Creating...')
      expect(createButton).toBeInTheDocument()
      expect(createButton.closest('button')).toBeDisabled()
    })

    it('should show cleaning state', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        isCleaning: true
      })

      renderWithProviders(<ArchiveManagement />)
      
      const cleanButton = screen.getByText('Cleaning...')
      expect(cleanButton).toBeInTheDocument()
      expect(cleanButton.closest('button')).toBeDisabled()
    })

    it('should show restoring state in dialog', async () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        isRestoring: true
      })

      renderWithProviders(<ArchiveManagement />)

      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)

      expect(screen.getByText('Restoring...')).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should show pagination when multiple pages', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        totalPages: 3,
        currentPage: 1
      })

      renderWithProviders(<ArchiveManagement />)

      expect(screen.getByText('2 of 3')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument()
    })

    it('should handle page navigation', async () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        totalPages: 3,
        currentPage: 1
      })

      renderWithProviders(<ArchiveManagement />)

      const nextButton = screen.getByRole('button', { name: /Next/i })
      await user.click(nextButton)

      expect(mockHookReturn.goToPage).toHaveBeenCalledWith(2)
    })

    it('should disable pagination buttons appropriately', () => {
      mockUseArchiveManagement.mockReturnValue({
        ...mockHookReturn,
        totalPages: 3,
        currentPage: 0
      })

      renderWithProviders(<ArchiveManagement />)

      const prevButton = screen.getByRole('button', { name: /Previous/i })
      expect(prevButton).toBeDisabled()

      const nextButton = screen.getByRole('button', { name: /Next/i })
      expect(nextButton).not.toBeDisabled()
    })
  })

  describe('Toast Notifications', () => {
    it('should show success toast on successful operations', async () => {
      mockHookReturn.deleteArchive.mockResolvedValue(undefined)

      renderWithProviders(<ArchiveManagement />)

      const deleteButton = screen.getByRole('button', { name: /trash/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Archive Deleted',
          description: 'Archive has been deleted successfully.',
        })
      })
    })

    it('should show error toast on failed operations', async () => {
      mockHookReturn.deleteArchive.mockRejectedValue(new Error('Delete failed'))

      renderWithProviders(<ArchiveManagement />)

      const deleteButton = screen.getByRole('button', { name: /trash/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Delete Failed',
          description: 'Delete failed',
          variant: 'destructive',
        })
      })
    })
  })
})
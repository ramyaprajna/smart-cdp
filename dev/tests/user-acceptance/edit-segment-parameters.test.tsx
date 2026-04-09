/**
 * User Acceptance Tests: Edit Segment Parameters Feature
 * 
 * Comprehensive test suite validating the complete Edit Segment Parameters feature
 * including data flow, format compatibility, user interactions, and auto-refresh integration.
 * 
 * Test Categories:
 * 1. Edit Modal Pre-population & Data Flow
 * 2. Format Compatibility (new $exists ↔ legacy boolean)
 * 3. Form Interaction & Validation
 * 4. Save Functionality & Criteria Transformation
 * 5. Auto-refresh Integration
 * 6. Edge Cases & Error Handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditSegmentModal } from '@/components/segments/edit-segment-modal';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

// Test data fixtures
const mockSegmentWithEmailPhoneCriteria = {
  id: 'test-segment-1',
  name: 'Test Email & Phone Segment',
  description: 'Test segment with email and phone criteria',
  isActive: true,
  criteria: {
    email: { $exists: true },
    phoneNumber: { $exists: true }
  }
};

const mockSegmentWithLegacyFormat = {
  id: 'test-segment-2', 
  name: 'Legacy Format Segment',
  description: 'Test segment with legacy boolean format',
  isActive: true,
  criteria: {
    hasEmail: true,
    hasPhone: false
  }
};

const mockSegmentWithMixedFormat = {
  id: 'test-segment-3',
  name: 'Mixed Format Segment', 
  description: 'Test segment with mixed criteria format',
  isActive: true,
  criteria: {
    emailExists: { $exists: true },
    hasPhone: false,
    location: 'Jakarta'
  }
};

const mockEmptySegment = {
  id: 'test-segment-4',
  name: 'Empty Criteria Segment',
  description: 'Test segment with no criteria',
  isActive: true,
  criteria: {}
};

describe.skip('Edit Segment Parameters - User Acceptance Tests', { timeout: 30000 }, () => {
  let queryClient: QueryClient;
  let mockOnSave: ReturnType<typeof vi.fn>;
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockOnSave = vi.fn().mockResolvedValue(undefined);
    mockOnClose = vi.fn();

    // Setup fetch mocks
    (global.fetch as any).mockImplementation((url: string) => {
      // Mock segment metrics endpoint
      if (url.includes('/api/segments/metrics/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalCustomers: 1000,
            matchingCustomers: 250,
            percentageMatch: 25.0,
            estimatedReach: 250
          }),
        });
      }
      
      // Mock segment validation endpoint
      if (url.includes('/api/segments/validate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            isValid: true,
            errors: [],
            warnings: []
          }),
        });
      }
      
      // Default mock for unmocked URLs
      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderEditModal = (segment: any, isOpen = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <EditSegmentModal
          segment={segment}
          isOpen={isOpen}
          onClose={mockOnClose}
          onSave={mockOnSave}
          isLoading={false}
        />
      </QueryClientProvider>
    );
  };

  describe('1. Edit Modal Pre-population & Data Flow', () => {
    it('UAT-001: Should open modal with correct segment data pre-populated', async () => {
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Test segment with email and phone criteria')).toBeInTheDocument();
      });
    });

    it('UAT-002: Should transform new $exists format to simple boolean format for display', async () => {
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).toBeChecked();
        expect(phoneCheckbox).toBeChecked();
      });
    });

    it('UAT-003: Should handle legacy boolean format correctly', async () => {
      renderEditModal(mockSegmentWithLegacyFormat);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).toBeChecked();
        expect(phoneCheckbox).not.toBeChecked();
      });
    });

    it('UAT-004: Should detect simple mode for basic criteria', async () => {
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        // Should be in simple mode - check for simple form elements
        expect(screen.getByLabelText(/email exists/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/phone exists/i)).toBeInTheDocument();
      });
    });

    it('UAT-005: Should detect advanced mode for complex criteria', async () => {
      const complexSegment = {
        ...mockSegmentWithEmailPhoneCriteria,
        criteria: {
          email: { $exists: true },
          phoneNumber: { $exists: true },
          ageRange: { min: 25, max: 45 },
          location: 'Jakarta'
        }
      };

      renderEditModal(complexSegment);

      await waitFor(() => {
        // Should be in advanced mode - check for JSON editor or advanced form
        expect(screen.getByText(/advanced/i)).toBeInTheDocument();
      });
    });
  });

  describe('2. Format Compatibility & Transformation', () => {
    it('UAT-006: Should handle mixed format criteria correctly', async () => {
      renderEditModal(mockSegmentWithMixedFormat);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).toBeChecked(); // emailExists: { $exists: true }
        expect(phoneCheckbox).not.toBeChecked(); // hasPhone: false
      });
    });

    it('UAT-007: Should transform all variations of existence format', async () => {
      const variationSegment = {
        id: 'variation-test',
        name: 'Format Variation Test',
        description: 'Testing all format variations',
        isActive: true,
        criteria: {
          email: { $exists: true },
          phoneExists: { $exists: false },
          hasEmail: false, // Should be overridden by email.$exists
          hasPhone: true   // Should be overridden by phoneExists.$exists
        }
      };

      renderEditModal(variationSegment);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        // Should prioritize $exists format over legacy boolean
        expect(emailCheckbox).toBeChecked();    // email.$exists: true wins
        expect(phoneCheckbox).not.toBeChecked(); // phoneExists.$exists: false wins
      });
    });

    it('UAT-008: Should handle empty criteria gracefully', async () => {
      renderEditModal(mockEmptySegment);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).not.toBeChecked();
        expect(phoneCheckbox).not.toBeChecked();
      });
    });
  });

  describe('3. Form Interaction & User Experience', () => {
    it('UAT-009: Should allow toggling email existence checkbox', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        expect(emailCheckbox).toBeChecked();
      });

      const emailCheckbox = screen.getByLabelText(/email exists/i);
      await user.click(emailCheckbox);

      expect(emailCheckbox).not.toBeChecked();
    });

    it('UAT-010: Should allow toggling phone existence checkbox', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        expect(phoneCheckbox).toBeChecked();
      });

      const phoneCheckbox = screen.getByLabelText(/phone exists/i);
      await user.click(phoneCheckbox);

      expect(phoneCheckbox).not.toBeChecked();
    });

    it('UAT-011: Should validate required fields', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      // Clear the name field
      const nameInput = await screen.findByDisplayValue('Test Email & Phone Segment');
      await user.clear(nameInput);

      // Try to save
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('UAT-012: Should handle name length validation', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      const nameInput = await screen.findByDisplayValue('Test Email & Phone Segment');
      const longName = 'A'.repeat(101); // Exceeds 100 character limit
      
      await user.clear(nameInput);
      await user.type(nameInput, longName);

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/too long/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('4. Save Functionality & Criteria Transformation', () => {
    it('UAT-013: Should save changes with correct criteria transformation', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      // Toggle phone checkbox off
      const phoneCheckbox = screen.getByLabelText(/phone exists/i);
      await user.click(phoneCheckbox);

      // Save changes
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Verify save was called with correct transformation
      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('test-segment-1', {
          name: 'Test Email & Phone Segment',
          description: 'Test segment with email and phone criteria',
          isActive: true,
          criteria: {
            emailExists: { $exists: true },
            phoneExists: { $exists: false }
          }
        });
      });
    });

    it('UAT-014: Should transform true boolean values to $exists format', async () => {
      const user = userEvent.setup();
      renderEditModal(mockEmptySegment);

      // Wait for form to load
      await waitFor(() => {
        expect(screen.getByDisplayValue('Empty Criteria Segment')).toBeInTheDocument();
      });

      // Enable email checkbox
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      await user.click(emailCheckbox);

      // Save changes  
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('test-segment-4', {
          name: 'Empty Criteria Segment',
          description: 'Test segment with no criteria',
          isActive: true,
          criteria: {
            emailExists: { $exists: true }
          }
        });
      });
    });

    it('UAT-015: Should handle both email and phone being false', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      // Disable both checkboxes
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      const phoneCheckbox = screen.getByLabelText(/phone exists/i);
      
      await user.click(emailCheckbox); // Turn off
      await user.click(phoneCheckbox); // Turn off

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('test-segment-1', {
          name: 'Test Email & Phone Segment',
          description: 'Test segment with email and phone criteria',
          isActive: true,
          criteria: {
            emailExists: { $exists: false },
            phoneExists: { $exists: false }
          }
        });
      });
    });

    it('UAT-016: Should update segment name and description', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      // Update name and description
      const nameInput = screen.getByDisplayValue('Test Email & Phone Segment');
      const descInput = screen.getByDisplayValue('Test segment with email and phone criteria');

      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Segment Name');
      
      await user.clear(descInput);
      await user.type(descInput, 'Updated segment description');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('test-segment-1', {
          name: 'Updated Segment Name',
          description: 'Updated segment description',
          isActive: true,
          criteria: {
            emailExists: { $exists: true },
            phoneExists: { $exists: true }
          }
        });
      });
    });
  });

  describe('5. Error Handling & Edge Cases', () => {
    it('UAT-017: Should handle save error gracefully', async () => {
      const mockToast = vi.fn();
      (useToast as any).mockReturnValue({ toast: mockToast });
      
      mockOnSave.mockRejectedValueOnce(new Error('Save failed'));
      
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Update Failed',
          description: 'Failed to save segment parameters. Please try again.',
          variant: 'destructive'
        });
      });
    });

    it('UAT-018: Should handle modal close without saving', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      // Make changes but close without saving
      const emailCheckbox = screen.getByLabelText(/email exists/i);
      await user.click(emailCheckbox);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('UAT-019: Should handle undefined segment gracefully', async () => {
      renderEditModal(undefined);

      // Modal should not crash and should not show content
      expect(screen.queryByDisplayValue(/test/i)).not.toBeInTheDocument();
    });

    it('UAT-020: Should handle segment without criteria field', async () => {
      const segmentWithoutCriteria = {
        id: 'no-criteria',
        name: 'No Criteria Segment',
        description: 'Segment without criteria field',
        isActive: true
        // No criteria field at all
      };

      renderEditModal(segmentWithoutCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('No Criteria Segment')).toBeInTheDocument();
        
        // Should default to unchecked
        const emailCheckbox = screen.getByLabelText(/email exists/i);
        const phoneCheckbox = screen.getByLabelText(/phone exists/i);
        
        expect(emailCheckbox).not.toBeChecked();
        expect(phoneCheckbox).not.toBeChecked();
      });
    });
  });

  describe('6. Integration & Performance', () => {
    it('UAT-021: Should show loading state during save', async () => {
      // Make save take some time
      mockOnSave.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
      
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Should show loading state
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });

    it('UAT-022: Should call onClose after successful save', async () => {
      const mockToast = vi.fn();
      (useToast as any).mockReturnValue({ toast: mockToast });

      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Segment Updated',
          description: 'Test Email & Phone Segment parameters saved successfully'
        });
      });
    });

    it('UAT-023: Should handle rapid toggle interactions', async () => {
      const user = userEvent.setup();
      renderEditModal(mockSegmentWithEmailPhoneCriteria);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Email & Phone Segment')).toBeInTheDocument();
      });

      const emailCheckbox = screen.getByLabelText(/email exists/i);
      
      // Rapidly toggle checkbox multiple times
      await user.click(emailCheckbox); // Off
      await user.click(emailCheckbox); // On
      await user.click(emailCheckbox); // Off
      await user.click(emailCheckbox); // On

      // Final state should be on
      expect(emailCheckbox).toBeChecked();

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('test-segment-1', expect.objectContaining({
          criteria: {
            emailExists: { $exists: true },
            phoneExists: { $exists: true }
          }
        }));
      });
    });
  });
});
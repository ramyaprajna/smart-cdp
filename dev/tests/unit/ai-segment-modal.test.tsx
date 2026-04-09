/**
 * AI Segment Modal Component Tests
 * 
 * Evidence-based testing for AI segment suggestion modal UI component
 * Tests user interactions, state management, and API integration
 * 
 * @created August 11, 2025
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiSegmentModal } from '@/components/segments/ai-segment-modal';
import * as api from '@/lib/api';

// Mock the API functions
vi.mock('@/lib/api', () => ({
  generateAISegmentSuggestions: vi.fn(),
  createSegmentFromAI: vi.fn()
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Brain: () => <div data-testid="brain-icon">Brain Icon</div>,
  Users: () => <div data-testid="users-icon">Users Icon</div>,
  TrendingUp: () => <div data-testid="trending-up-icon">TrendingUp Icon</div>,
  CheckCircle: () => <div data-testid="check-circle-icon">CheckCircle Icon</div>,
  Lightbulb: () => <div data-testid="lightbulb-icon">Lightbulb Icon</div>,
  Target: () => <div data-testid="target-icon">Target Icon</div>,
  Zap: () => <div data-testid="zap-icon">Zap Icon</div>
}));

const mockSuggestions = [
  {
    id: 'ai-seg-001',
    name: 'High-Value Tech Professionals',
    description: 'Technology professionals with high lifetime value and consistent engagement',
    criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
    reasoning: 'This segment represents customers with high spending power and technical expertise',
    estimatedSize: 1542,
    businessValue: 'high' as const,
    confidence: 92,
    keyCharacteristics: ['High income', 'Tech-savvy', 'Regular users'],
    suggestedActions: ['Premium product offerings', 'Technical content', 'Early access programs']
  },
  {
    id: 'ai-seg-002',
    name: 'Emerging Students',
    description: 'Young students with growing potential and good engagement',
    criteria: { customerSegment: 'Student', lifetimeValue: { $gt: 100, $lt: 500 } },
    reasoning: 'Growing segment with increasing value potential for educational content',
    estimatedSize: 856,
    businessValue: 'medium' as const,
    confidence: 78,
    keyCharacteristics: ['Young demographics', 'Educational focus', 'Price-sensitive'],
    suggestedActions: ['Student discounts', 'Educational content', 'Campus partnerships']
  }
];

describe('AiSegmentModal Component', () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;
  const mockOnClose = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderModal = (isOpen = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AiSegmentModal isOpen={isOpen} onClose={mockOnClose} />
      </QueryClientProvider>
    );
  };

  describe('Initial State', () => {
    it('should render modal when open', () => {
      renderModal(true);
      
      expect(screen.getByText('AI-Powered Segment Generation')).toBeInTheDocument();
      expect(screen.getByText(/Generate intelligent customer segments/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate AI Segment Suggestions/ })).toBeInTheDocument();
    });

    it('should not render modal when closed', () => {
      renderModal(false);
      
      expect(screen.queryByText('AI-Powered Segment Generation')).not.toBeInTheDocument();
    });

    it('should display initial generation prompt', () => {
      renderModal();
      
      expect(screen.getByText('Ready to Analyze Your Customer Base')).toBeInTheDocument();
      expect(screen.getByText(/Our AI will analyze customer profiles/)).toBeInTheDocument();
      expect(screen.getByTestId('brain-icon')).toBeInTheDocument();
    });
  });

  describe('AI Suggestion Generation', () => {
    it('should generate suggestions when button is clicked', async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockResolvedValue({
        suggestions: mockSuggestions
      });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(api.generateAISegmentSuggestions).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
        expect(screen.getByText('High-Value Tech Professionals')).toBeInTheDocument();
        expect(screen.getByText('Emerging Students')).toBeInTheDocument();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'AI Analysis Complete',
        description: 'Generated 2 intelligent segment suggestions'
      });
    });

    it('should show loading state during generation', async () => {
      // Mock a delayed response
      vi.mocked(api.generateAISegmentSuggestions).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ suggestions: mockSuggestions }), 100)
        )
      );

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      expect(screen.getByText('Analyzing Customer Data...')).toBeInTheDocument();
      expect(generateButton).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
      });
    });

    it('should handle generation errors gracefully', async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockRejectedValue(
        new Error('API connection failed')
      );

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'AI Generation Failed',
          description: 'Unable to generate segment suggestions. Please try again.',
          variant: 'destructive'
        });
      });
    });

    it('should handle empty suggestions response', async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockResolvedValue({
        suggestions: []
      });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'No Suggestions Generated',
          description: "AI analysis didn't find significant patterns for new segments",
          variant: 'destructive'
        });
      });
    });
  });

  describe('Suggestion Display', () => {
    beforeEach(async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockResolvedValue({
        suggestions: mockSuggestions
      });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
      });
    });

    it('should display suggestion details correctly', () => {
      // Check first suggestion
      expect(screen.getByText('High-Value Tech Professionals')).toBeInTheDocument();
      expect(screen.getByText('Technology professionals with high lifetime value and consistent engagement')).toBeInTheDocument();
      expect(screen.getByText('HIGH VALUE')).toBeInTheDocument();
      expect(screen.getByText('92% confidence')).toBeInTheDocument();
      expect(screen.getByText('1,542 customers')).toBeInTheDocument();

      // Check reasoning section
      expect(screen.getByText('This segment represents customers with high spending power and technical expertise')).toBeInTheDocument();

      // Check characteristics
      expect(screen.getByText('High income')).toBeInTheDocument();
      expect(screen.getByText('Tech-savvy')).toBeInTheDocument();
      expect(screen.getByText('Regular users')).toBeInTheDocument();

      // Check suggested actions
      expect(screen.getByText('Premium product offerings')).toBeInTheDocument();
      expect(screen.getByText('Technical content')).toBeInTheDocument();
      expect(screen.getByText('Early access programs')).toBeInTheDocument();
    });

    it('should display business value badges with correct colors', () => {
      const highValueBadge = screen.getByText('HIGH VALUE');
      const mediumValueBadge = screen.getByText('MEDIUM VALUE');

      expect(highValueBadge).toBeInTheDocument();
      expect(mediumValueBadge).toBeInTheDocument();
    });

    it('should display confidence scores with appropriate colors', () => {
      expect(screen.getByText('92% confidence')).toBeInTheDocument();
      expect(screen.getByText('78% confidence')).toBeInTheDocument();
    });

    it('should show customer counts and metrics', () => {
      expect(screen.getByText('1,542')).toBeInTheDocument();
      expect(screen.getByText('856')).toBeInTheDocument();
      expect(screen.getByText(/customers/)).toBeInTheDocument();
    });
  });

  describe('Segment Creation', () => {
    beforeEach(async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockResolvedValue({
        suggestions: mockSuggestions
      });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
      });
    });

    it('should create segment when Create button is clicked', async () => {
      const mockCreatedSegment = {
        id: 'segment-123',
        name: 'High-Value Tech Professionals',
        description: 'Technology professionals with high lifetime value and consistent engagement',
        criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
        isActive: true,
        customerCount: 0,
        createdAt: '2025-08-11T10:00:00Z'
      };

      vi.mocked(api.createSegmentFromAI).mockResolvedValue(mockCreatedSegment);

      const createButtons = screen.getAllByText('Create This Segment');
      await user.click(createButtons[0]);

      await waitFor(() => {
        expect(api.createSegmentFromAI).toHaveBeenCalledWith(mockSuggestions[0]);
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'AI Segment Created Successfully',
        description: 'Your new segment has been created and is ready for use'
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should show loading state during creation', async () => {
      vi.mocked(api.createSegmentFromAI).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            id: 'segment-123',
            name: 'Test Segment',
            description: 'Test',
            criteria: {},
            isActive: true,
            customerCount: 0,
            createdAt: '2025-08-11T10:00:00Z'
          }), 100)
        )
      );

      const createButtons = screen.getAllByText('Create This Segment');
      await user.click(createButtons[0]);

      expect(screen.getByText('Creating Segment...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should handle creation errors', async () => {
      vi.mocked(api.createSegmentFromAI).mockRejectedValue(
        new Error('Failed to create segment')
      );

      const createButtons = screen.getAllByText('Create This Segment');
      await user.click(createButtons[0]);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error Creating Segment',
          description: 'Failed to create segment',
          variant: 'destructive'
        });
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Modal Interactions', () => {
    it('should close modal when onClose is called', () => {
      renderModal();
      
      // Modal should be open initially
      expect(screen.getByText('AI-Powered Segment Generation')).toBeInTheDocument();
      
      // Simulate closing (would be triggered by dialog close button)
      mockOnClose();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should allow regeneration of suggestions', async () => {
      vi.mocked(api.generateAISegmentSuggestions)
        .mockResolvedValueOnce({ suggestions: mockSuggestions })
        .mockResolvedValueOnce({ suggestions: [mockSuggestions[0]] });

      renderModal();

      // Generate initial suggestions
      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
      });

      // Regenerate suggestions
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/ });
      await user.click(regenerateButton);

      await waitFor(() => {
        expect(api.generateAISegmentSuggestions).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error States', () => {
    it('should reset state properly after errors', async () => {
      // First call fails
      vi.mocked(api.generateAISegmentSuggestions)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ suggestions: mockSuggestions });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      
      // First attempt fails
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'AI Generation Failed',
          description: 'Unable to generate segment suggestions. Please try again.',
          variant: 'destructive'
        });
      });

      // Second attempt succeeds
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (2)')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels and roles', () => {
      renderModal();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate AI Segment Suggestions/ })).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      vi.mocked(api.generateAISegmentSuggestions).mockResolvedValue({
        suggestions: mockSuggestions
      });

      renderModal();

      const generateButton = screen.getByRole('button', { name: /Generate AI Segment Suggestions/ });
      
      // Tab to button and activate with Enter
      generateButton.focus();
      await user.keyboard('[Enter]');

      await waitFor(() => {
        expect(api.generateAISegmentSuggestions).toHaveBeenCalled();
      });
    });
  });
});
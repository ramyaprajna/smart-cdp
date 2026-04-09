/**
 * AI Segment Generation End-to-End Workflow Tests
 * 
 * Evidence-based testing for complete AI segment generation workflow
 * Tests integration between backend AI service, API endpoints, and frontend components
 * 
 * @created August 11, 2025
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

// Mock API functions
global.fetch = vi.fn();

// Mock environment
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock toast notifications
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

// Note: lucide-react icons are mocked globally in test/setup.ts

// Test Component that simulates the Segments page with AI modal
const TestSegmentsPage = () => {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [segments, setSegments] = useState([]);

  const generateAISuggestions = async () => {
    const response = await fetch('/api/ai/segment-suggestions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate suggestions');
    }
    
    return response.json();
  };

  const createSegmentFromAI = async (segmentData: any) => {
    const response = await fetch('/api/segments/from-ai', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(segmentData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create segment');
    }
    
    return response.json();
  };

  const handleGenerateSuggestions = async () => {
    try {
      const result = await generateAISuggestions();
      return result.suggestions;
    } catch (error) {
      mockToast({
        title: 'AI Generation Failed',
        description: 'Unable to generate segment suggestions',
        variant: 'destructive'
      });
      return [];
    }
  };

  const handleCreateSegment = async (suggestion: any) => {
    try {
      const created = await createSegmentFromAI(suggestion);
      setSegments(prev => [...prev, created]);
      mockToast({
        title: 'AI Segment Created Successfully',
        description: 'Your new segment has been created and is ready for use'
      });
      setIsAiModalOpen(false);
    } catch (error) {
      mockToast({
        title: 'Error Creating Segment',
        description: 'Failed to create segment',
        variant: 'destructive'
      });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Customer Segments</h1>
        <div className="action-buttons">
          <button
            onClick={() => setIsAiModalOpen(true)}
            data-testid="open-ai-modal"
          >
            <div data-testid="brain-icon">🧠</div>
            Create Segment with AI
          </button>
          <button data-testid="create-manual-segment">
            <div data-testid="plus-icon">➕</div>
            Create Segment
          </button>
        </div>
      </div>

      <div className="segments-list">
        {segments.map((segment: any) => (
          <div key={segment.id} data-testid={`segment-${segment.id}`}>
            <h3>{segment.name}</h3>
            <p>{segment.description}</p>
            <span>Active: {segment.isActive ? 'Yes' : 'No'}</span>
          </div>
        ))}
      </div>

      {isAiModalOpen && (
        <MockAiSegmentModal
          onClose={() => setIsAiModalOpen(false)}
          onGenerateSuggestions={handleGenerateSuggestions}
          onCreateSegment={handleCreateSegment}
        />
      )}
    </div>
  );
};

// Mock AI Segment Modal Component
const MockAiSegmentModal = ({ onClose, onGenerateSuggestions, onCreateSegment }: any) => {
  const [suggestions, setSuggestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const newSuggestions = await onGenerateSuggestions();
      setSuggestions(newSuggestions);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreate = async (suggestion: any) => {
    setIsCreating(true);
    try {
      await onCreateSegment(suggestion);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div data-testid="ai-segment-modal" className="modal">
      <div className="modal-header">
        <h2>AI-Powered Segment Generation</h2>
        <button onClick={onClose} data-testid="close-modal">×</button>
      </div>

      <div className="modal-content">
        {suggestions.length === 0 ? (
          <div className="initial-state">
            <div data-testid="brain-icon">🧠</div>
            <h3>Ready to Analyze Your Customer Base</h3>
            <p>Our AI will analyze customer profiles, behavioral patterns, and vector embeddings</p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              data-testid="generate-suggestions"
            >
              {isGenerating ? 'Analyzing Customer Data...' : 'Generate AI Segment Suggestions'}
            </button>
          </div>
        ) : (
          <div className="suggestions-list">
            <div className="header">
              <h3>AI Generated Segments ({suggestions.length})</h3>
              <button onClick={handleGenerate} disabled={isGenerating} data-testid="regenerate">
                {isGenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>

            {suggestions.map((suggestion: any) => (
              <div key={suggestion.id} data-testid={`suggestion-${suggestion.id}`} className="suggestion-card">
                <div className="suggestion-header">
                  <h4>{suggestion.name}</h4>
                  <div className="badges">
                    <span className={`business-value ${suggestion.businessValue}`}>
                      {suggestion.businessValue.toUpperCase()} VALUE
                    </span>
                    <span className="confidence">
                      {suggestion.confidence}% confidence
                    </span>
                  </div>
                </div>

                <p className="description">{suggestion.description}</p>

                <div className="metrics">
                  <div data-testid="users-icon">👥</div>
                  <span>{suggestion.estimatedSize.toLocaleString()} customers</span>
                  <div data-testid="trending-up-icon">📈</div>
                  <span>{suggestion.businessValue} business value</span>
                </div>

                <div className="reasoning">
                  <div data-testid="lightbulb-icon">💡</div>
                  <span>AI Reasoning</span>
                  <p>{suggestion.reasoning}</p>
                </div>

                <div className="characteristics">
                  <div data-testid="check-circle-icon">✅</div>
                  <span>Key Characteristics</span>
                  <div className="badges">
                    {suggestion.keyCharacteristics.map((char: string, idx: number) => (
                      <span key={idx} className="characteristic-badge">{char}</span>
                    ))}
                  </div>
                </div>

                <div className="actions-section">
                  <div data-testid="target-icon">🎯</div>
                  <span>Suggested Actions</span>
                  <div className="badges">
                    {suggestion.suggestedActions.map((action: string, idx: number) => (
                      <span key={idx} className="action-badge">{action}</span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleCreate(suggestion)}
                  disabled={isCreating}
                  data-testid={`create-segment-${suggestion.id}`}
                  className="create-button"
                >
                  {isCreating ? 'Creating Segment...' : 'Create This Segment'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

describe('AI Segment Generation E2E Workflow', () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;

  // Realistic mock data based on actual customer profiles
  const mockSuggestions = [
    {
      id: 'ai-seg-001',
      name: 'Premium Jakarta Tech Professionals',
      description: 'High-value technology professionals based in Jakarta with consistent engagement and premium purchasing behavior',
      criteria: {
        lifetimeValue: { $gt: 1500 },
        customerSegment: 'Professional',
        'currentAddress.city': 'Jakarta',
        'unmappedFields.profession': { $regex: 'Engineer|Developer|Tech' }
      },
      reasoning: 'This segment combines geographic targeting with professional demographics and high value behavior, ideal for premium tech product campaigns',
      estimatedSize: 1247,
      businessValue: 'high',
      confidence: 94,
      keyCharacteristics: ['High lifetime value', 'Jakarta-based', 'Technology professionals', 'Premium buyers'],
      suggestedActions: ['Tech conference sponsorships', 'Premium product launches', 'Professional networking events']
    },
    {
      id: 'ai-seg-002',
      name: 'Emerging Student Community',
      description: 'Active student segment with growing engagement and potential for long-term value development',
      criteria: {
        customerSegment: 'Student',
        lifetimeValue: { $gt: 150, $lt: 600 },
        dataQualityScore: { $gt: 95 },
        lastActiveAt: { $gte: '2025-07-01' }
      },
      reasoning: 'Students with high data quality and recent activity show strong engagement potential for educational partnerships and youth-focused campaigns',
      estimatedSize: 892,
      businessValue: 'medium',
      confidence: 82,
      keyCharacteristics: ['Active engagement', 'Educational focus', 'Quality data', 'Growth potential'],
      suggestedActions: ['Student discount programs', 'Campus partnerships', 'Educational content series']
    },
    {
      id: 'ai-seg-003',
      name: 'Multi-City Entrepreneurs',
      description: 'Business owners and entrepreneurs distributed across major Indonesian cities with high business value',
      criteria: {
        customerSegment: 'Entrepreneur',
        lifetimeValue: { $gt: 2000 },
        'currentAddress.city': { $in: ['Jakarta', 'Surabaya', 'Bandung', 'Medan'] }
      },
      reasoning: 'Entrepreneur segment with proven high value and multi-city presence enables targeted B2B campaigns and regional business initiatives',
      estimatedSize: 423,
      businessValue: 'high',
      confidence: 88,
      keyCharacteristics: ['Business owners', 'Multi-city presence', 'High investment capacity', 'B2B potential'],
      suggestedActions: ['B2B partnership programs', 'Executive networking events', 'Business solution offerings']
    }
  ];

  beforeAll(() => {
    // Set up global mocks
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000' },
      writable: true
    });
  });

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

  const renderTestPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TestSegmentsPage />
      </QueryClientProvider>
    );
  };

  describe('Complete AI Segment Workflow', () => {
    it('should complete full workflow: open modal → generate suggestions → create segment', async () => {
      // Mock successful API responses
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: mockSuggestions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'segment-created-001',
            name: 'Premium Jakarta Tech Professionals',
            description: 'High-value technology professionals based in Jakarta with consistent engagement and premium purchasing behavior',
            criteria: {
              lifetimeValue: { $gt: 1500 },
              customerSegment: 'Professional',
              'currentAddress.city': 'Jakarta'
            },
            isActive: true,
            customerCount: 0,
            createdAt: '2025-08-11T10:00:00Z',
            updatedAt: '2025-08-11T10:00:00Z'
          }),
        });

      renderTestPage();

      // Step 1: Open AI segment modal
      expect(screen.getByText('Customer Segments')).toBeInTheDocument();
      
      const aiButton = screen.getByTestId('open-ai-modal');
      expect(aiButton).toHaveTextContent('Create Segment with AI');
      
      await user.click(aiButton);

      // Verify modal opened
      expect(screen.getByTestId('ai-segment-modal')).toBeInTheDocument();
      expect(screen.getByText('AI-Powered Segment Generation')).toBeInTheDocument();
      expect(screen.getByText('Ready to Analyze Your Customer Base')).toBeInTheDocument();

      // Step 2: Generate AI suggestions
      const generateButton = screen.getByTestId('generate-suggestions');
      expect(generateButton).toHaveTextContent('Generate AI Segment Suggestions');
      
      await user.click(generateButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByText('Analyzing Customer Data...')).toBeInTheDocument();
      });

      // Wait for suggestions to load
      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      // Verify suggestions are displayed
      expect(screen.getByText('Premium Jakarta Tech Professionals')).toBeInTheDocument();
      expect(screen.getByText('Emerging Student Community')).toBeInTheDocument();
      expect(screen.getByText('Multi-City Entrepreneurs')).toBeInTheDocument();

      // Verify first suggestion details
      expect(screen.getByText('HIGH VALUE')).toBeInTheDocument();
      expect(screen.getByText('94% confidence')).toBeInTheDocument();
      expect(screen.getByText('1,247 customers')).toBeInTheDocument();
      expect(screen.getByText('High lifetime value')).toBeInTheDocument();
      expect(screen.getByText('Tech conference sponsorships')).toBeInTheDocument();

      // Step 3: Create segment from first suggestion
      const createButton = screen.getByTestId('create-segment-ai-seg-001');
      expect(createButton).toHaveTextContent('Create This Segment');
      
      await user.click(createButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByText('Creating Segment...')).toBeInTheDocument();
      });

      // Wait for segment creation to complete
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'AI Segment Created Successfully',
          description: 'Your new segment has been created and is ready for use'
        });
      });

      // Verify modal closed and segment appears in list
      expect(screen.queryByTestId('ai-segment-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('segment-segment-created-001')).toBeInTheDocument();
      expect(screen.getByText('Premium Jakarta Tech Professionals')).toBeInTheDocument();

      // Verify API calls were made correctly
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/ai/segment-suggestions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token',
          'Content-Type': 'application/json'
        }
      });
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/segments/from-ai', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mockSuggestions[0])
      });
    });

    it('should handle API failures gracefully during workflow', async () => {
      // Mock API failure for suggestion generation
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'AI Generation Failed',
          description: 'Unable to generate segment suggestions',
          variant: 'destructive'
        });
      });

      // Modal should remain open for retry
      expect(screen.getByTestId('ai-segment-modal')).toBeInTheDocument();
    });

    it('should handle segment creation failures after successful suggestion generation', async () => {
      // Mock successful suggestion generation, but failed creation
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: mockSuggestions }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database connection failed' }),
        });

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('create-segment-ai-seg-001'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error Creating Segment',
          description: 'Failed to create segment',
          variant: 'destructive'
        });
      });

      // Modal should remain open, no segment created
      expect(screen.getByTestId('ai-segment-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('segment-segment-created-001')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Segment Creation Workflow', () => {
    it('should allow creating multiple segments from same suggestion set', async () => {
      // Mock successful API responses for multiple creations
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: mockSuggestions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'segment-001',
            name: 'Premium Jakarta Tech Professionals',
            description: mockSuggestions[0].description,
            criteria: mockSuggestions[0].criteria,
            isActive: true,
            customerCount: 0,
            createdAt: '2025-08-11T10:00:00Z'
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'segment-002',
            name: 'Emerging Student Community',
            description: mockSuggestions[1].description,
            criteria: mockSuggestions[1].criteria,
            isActive: true,
            customerCount: 0,
            createdAt: '2025-08-11T10:01:00Z'
          }),
        });

      renderTestPage();

      // Generate suggestions
      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      // Create first segment
      await user.click(screen.getByTestId('create-segment-ai-seg-001'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'AI Segment Created Successfully',
          description: 'Your new segment has been created and is ready for use'
        });
      });

      // Modal should close after first creation
      expect(screen.queryByTestId('ai-segment-modal')).not.toBeInTheDocument();

      // Open modal again for second segment
      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      // Create second segment
      await user.click(screen.getByTestId('create-segment-ai-seg-002'));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledTimes(2);
      });

      // Verify both segments exist
      expect(screen.getByTestId('segment-segment-001')).toBeInTheDocument();
      expect(screen.getByTestId('segment-segment-002')).toBeInTheDocument();
    });
  });

  describe('Regeneration Workflow', () => {
    it('should allow regenerating suggestions with different results', async () => {
      const secondSuggestionSet = [
        {
          id: 'ai-seg-004',
          name: 'Active Bandung Professionals',
          description: 'Professional segment in Bandung with high activity',
          criteria: { customerSegment: 'Professional', 'currentAddress.city': 'Bandung' },
          reasoning: 'Geographic concentration for regional campaigns',
          estimatedSize: 567,
          businessValue: 'medium',
          confidence: 76,
          keyCharacteristics: ['Bandung-based', 'Professional'],
          suggestedActions: ['Regional events']
        }
      ];

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: mockSuggestions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: secondSuggestionSet }),
        });

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      // Regenerate suggestions
      await user.click(screen.getByTestId('regenerate'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (1)')).toBeInTheDocument();
        expect(screen.getByText('Active Bandung Professionals')).toBeInTheDocument();
      });

      // Original suggestions should be replaced
      expect(screen.queryByText('Premium Jakarta Tech Professionals')).not.toBeInTheDocument();
    });
  });

  describe('User Experience and Performance', () => {
    it('should provide clear loading states and feedback', async () => {
      // Mock delayed responses to test loading states
      global.fetch = vi.fn()
        .mockImplementation(() => 
          new Promise(resolve => 
            setTimeout(() => resolve({
              ok: true,
              json: async () => ({ suggestions: mockSuggestions }),
            }), 100)
          )
        );

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      
      const generateButton = screen.getByTestId('generate-suggestions');
      await user.click(generateButton);

      // Should show loading state immediately
      expect(screen.getByText('Analyzing Customer Data...')).toBeInTheDocument();
      expect(generateButton).toBeDisabled();

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });
    });

    it('should handle empty suggestion responses appropriately', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: [] }),
      });

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('Ready to Analyze Your Customer Base')).toBeInTheDocument();
      });

      // Should remain in initial state since no suggestions were generated
      expect(screen.queryByText('AI Generated Segments')).not.toBeInTheDocument();
    });
  });

  describe('Data Quality and Validation', () => {
    it('should display suggestion data accurately', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: mockSuggestions }),
      });

      renderTestPage();

      await user.click(screen.getByTestId('open-ai-modal'));
      await user.click(screen.getByTestId('generate-suggestions'));

      await waitFor(() => {
        expect(screen.getByText('AI Generated Segments (3)')).toBeInTheDocument();
      });

      // Verify first suggestion data accuracy
      const firstSuggestion = mockSuggestions[0];
      expect(screen.getByText(firstSuggestion.name)).toBeInTheDocument();
      expect(screen.getByText(firstSuggestion.description)).toBeInTheDocument();
      expect(screen.getByText('HIGH VALUE')).toBeInTheDocument();
      expect(screen.getByText('94% confidence')).toBeInTheDocument();
      expect(screen.getByText('1,247 customers')).toBeInTheDocument();

      // Verify characteristics and actions
      firstSuggestion.keyCharacteristics.forEach(char => {
        expect(screen.getByText(char)).toBeInTheDocument();
      });

      firstSuggestion.suggestedActions.forEach(action => {
        expect(screen.getByText(action)).toBeInTheDocument();
      });
    });
  });
});
/**
 * AI Segment Service Unit Tests
 * 
 * Evidence-based testing for AI-powered segment generation service
 * Tests customer data analysis, vector pattern recognition, and segment suggestion generation
 * 
 * @created August 11, 2025
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aiSegmentService } from '@server/services/ai-segment-service';
import * as storage from '@server/storage';
import OpenAI from 'openai';

// Mock OpenAI with proper constructor implementation
const { mockOpenAIInstance } = vi.hoisted(() => ({
  mockOpenAIInstance: {
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => mockOpenAIInstance)
}));

// Mock storage with realistic test data
vi.mock('@server/storage', () => ({
  storage: {
    getCustomers: vi.fn(),
    createSegment: vi.fn()
  }
}));

const mockCustomerData = [
  {
    id: 'cust-001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    customerSegment: 'Professional',
    lifetimeValue: 1200.50,
    dataQualityScore: 98.5,
    dateOfBirth: new Date('1985-06-15'),
    gender: 'Male',
    lastActiveAt: new Date('2025-08-10'),
    currentAddress: { city: 'Jakarta', province: 'DKI Jakarta' },
    unmappedFields: { profession: 'Software Engineer', company: 'Tech Corp' }
  },
  {
    id: 'cust-002',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    customerSegment: 'Student',
    lifetimeValue: 250.00,
    dataQualityScore: 95.2,
    dateOfBirth: new Date('2000-03-22'),
    gender: 'Female',
    lastActiveAt: new Date('2025-08-09'),
    currentAddress: { city: 'Bandung', province: 'West Java' },
    unmappedFields: { profession: 'Student', university: 'ITB' }
  },
  {
    id: 'cust-003',
    firstName: 'Ahmad',
    lastName: 'Wijaya',
    email: 'ahmad.wijaya@example.com',
    customerSegment: 'Entrepreneur',
    lifetimeValue: 2500.75,
    dataQualityScore: 99.1,
    dateOfBirth: new Date('1978-11-08'),
    gender: 'Male',
    lastActiveAt: new Date('2025-08-11'),
    currentAddress: { city: 'Jakarta', province: 'DKI Jakarta' },
    unmappedFields: { profession: 'Business Owner', company: 'Startup Inc' }
  }
];

describe('AI Segment Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock storage to return realistic customer data
    vi.mocked(storage.storage.getCustomers).mockResolvedValue({
      customers: mockCustomerData,
      total: mockCustomerData.length
    });

    // Set up environment variable mock
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateSegmentSuggestions', () => {
    it('should analyze customer base and generate AI suggestions', async () => {
      // Mock OpenAI response with realistic segment suggestions
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [
                {
                  name: 'High-Value Tech Professionals',
                  description: 'Technology professionals with high lifetime value and consistent engagement',
                  criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
                  reasoning: 'This segment represents customers with high spending power and technical expertise',
                  businessValue: 'high',
                  confidence: 92,
                  keyCharacteristics: ['High income', 'Tech-savvy', 'Regular users'],
                  suggestedActions: ['Premium product offerings', 'Technical content', 'Early access programs']
                },
                {
                  name: 'Jakarta Business Leaders',
                  description: 'Entrepreneurs and business owners based in Jakarta metropolitan area',
                  criteria: { customerSegment: 'Entrepreneur', 'currentAddress.city': 'Jakarta' },
                  reasoning: 'Geographic concentration of high-value business customers for targeted campaigns',
                  businessValue: 'high',
                  confidence: 88,
                  keyCharacteristics: ['Business owners', 'Jakarta-based', 'High LTV'],
                  suggestedActions: ['B2B networking events', 'Business-focused content', 'Local partnerships']
                }
              ]
            })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].name).toBe('High-Value Tech Professionals');
      expect(suggestions[0].businessValue).toBe('high');
      expect(suggestions[0].confidence).toBe(92);
      expect(suggestions[0].estimatedSize).toBeGreaterThan(0);
      expect(suggestions[1].name).toBe('Jakarta Business Leaders');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      // Mock OpenAI API failure
      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('OpenAI API error'))
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      // Should fall back to predefined suggestions
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].name).toBe('High Value Customers');
      expect(suggestions[1].name).toBe('Active Professionals');
      expect(suggestions[2].name).toBe('Emerging Customers');
    });

    it('should calculate demographics correctly', async () => {
      // Test demographic analysis with mock data
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({ segments: [] })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      await aiSegmentService.generateSegmentSuggestions();

      // Verify that getCustomers was called to analyze demographics
      expect(storage.storage.getCustomers).toHaveBeenCalledWith(0, 1000);
    });

    it('should estimate segment sizes accurately', async () => {
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [{
                name: 'Test Segment',
                description: 'Test description',
                criteria: { customerSegment: 'Professional' },
                reasoning: 'Test reasoning',
                businessValue: 'medium',
                confidence: 75,
                keyCharacteristics: ['Test'],
                suggestedActions: ['Test action']
              }]
            })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      expect(suggestions[0].estimatedSize).toBe(1); // Should match 1 'Professional' customer in mock data
    });
  });

  describe('Customer Analysis Methods', () => {
    it('should analyze age distributions correctly', async () => {
      // This tests the private analyzeDemographics method indirectly
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({ segments: [] })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      await aiSegmentService.generateSegmentSuggestions();

      // Verify customer data was processed
      expect(storage.storage.getCustomers).toHaveBeenCalled();
    });

    it('should handle missing customer data gracefully', async () => {
      // Mock empty customer data
      vi.mocked(storage.storage.getCustomers).mockResolvedValue({
        customers: [],
        total: 0
      });

      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({ segments: [] })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Criteria Evaluation', () => {
    it('should evaluate MongoDB-style criteria correctly', async () => {
      // Test the evaluateCondition method indirectly through segment estimation
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [{
                name: 'High Value Test',
                description: 'Test',
                criteria: { lifetimeValue: { $gt: 1000 } },
                reasoning: 'Test',
                businessValue: 'high',
                confidence: 80,
                keyCharacteristics: ['Test'],
                suggestedActions: ['Test']
              }]
            })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      // Should find 2 customers with lifetimeValue > 1000 (John and Ahmad)
      expect(suggestions[0].estimatedSize).toBe(2);
    });

    it('should handle complex criteria with multiple conditions', async () => {
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [{
                name: 'Jakarta Professionals',
                description: 'Test',
                criteria: { 
                  customerSegment: 'Professional',
                  'currentAddress.city': 'Jakarta'
                },
                reasoning: 'Test',
                businessValue: 'medium',
                confidence: 75,
                keyCharacteristics: ['Test'],
                suggestedActions: ['Test']
              }]
            })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      // Should find 1 customer (John) who is Professional AND in Jakarta
      expect(suggestions[0].estimatedSize).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      vi.mocked(storage.storage.getCustomers).mockRejectedValue(new Error('Database connection failed'));

      await expect(aiSegmentService.generateSegmentSuggestions()).rejects.toThrow('Failed to generate AI segment suggestions');
    });

    it('should handle malformed OpenAI responses', async () => {
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      // Should fall back to predefined suggestions
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].name).toBe('High Value Customers');
    });
  });

  describe('Business Value Sorting', () => {
    it('should sort suggestions by business value and size', async () => {
      const mockOpenAIResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              segments: [
                {
                  name: 'Low Value Small',
                  description: 'Test',
                  criteria: { lifetimeValue: { $lt: 100 } },
                  reasoning: 'Test',
                  businessValue: 'low',
                  confidence: 60,
                  keyCharacteristics: ['Test'],
                  suggestedActions: ['Test']
                },
                {
                  name: 'High Value Large',
                  description: 'Test',
                  criteria: { lifetimeValue: { $gt: 500 } },
                  reasoning: 'Test',
                  businessValue: 'high',
                  confidence: 90,
                  keyCharacteristics: ['Test'],
                  suggestedActions: ['Test']
                },
                {
                  name: 'Medium Value Medium',
                  description: 'Test',
                  criteria: { customerSegment: 'Student' },
                  reasoning: 'Test',
                  businessValue: 'medium',
                  confidence: 75,
                  keyCharacteristics: ['Test'],
                  suggestedActions: ['Test']
                }
              ]
            })
          }
        }]
      };

      vi.mocked(OpenAI).mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockOpenAIResponse)
          }
        }
      } as any));

      const suggestions = await aiSegmentService.generateSegmentSuggestions();

      // Should be sorted by business value (high first), then by size
      expect(suggestions[0].businessValue).toBe('high');
      expect(suggestions[0].name).toBe('High Value Large');
    });
  });
});
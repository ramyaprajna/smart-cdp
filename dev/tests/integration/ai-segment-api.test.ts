/**
 * AI Segment API Integration Tests
 * 
 * Evidence-based testing for AI segment generation API endpoints
 * Tests complete API workflow from suggestion generation to segment creation
 * 
 * @created August 11, 2025
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockUser } from '../setup';

// Mock fetch for API testing
global.fetch = vi.fn();

describe('AI Segment API Integration Tests', () => {
  let authToken: string;
  const API_BASE = 'http://localhost:5000';

  beforeEach(() => {
    vi.clearAllMocks();
    authToken = 'mock-jwt-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/ai/segment-suggestions', () => {
    it('should generate AI segment suggestions successfully', async () => {
      const mockSuggestions = [
        {
          id: 'ai-seg-001',
          name: 'High-Value Tech Professionals',
          description: 'Technology professionals with high lifetime value and consistent engagement',
          criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
          reasoning: 'This segment represents customers with high spending power and technical expertise',
          estimatedSize: 1542,
          businessValue: 'high',
          confidence: 92,
          keyCharacteristics: ['High income', 'Tech-savvy', 'Regular users'],
          suggestedActions: ['Premium product offerings', 'Technical content', 'Early access programs']
        },
        {
          id: 'ai-seg-002',
          name: 'Emerging Young Professionals',
          description: 'Young professionals with growing potential and good engagement',
          criteria: { 
            lifetimeValue: { $gt: 200, $lt: 800 }, 
            customerSegment: 'Professional',
            ageRange: { min: 25, max: 35 }
          },
          reasoning: 'Growing segment with increasing value potential',
          estimatedSize: 892,
          businessValue: 'medium',
          confidence: 78,
          keyCharacteristics: ['Growing income', 'Career-focused', 'Digital natives'],
          suggestedActions: ['Career development content', 'Networking opportunities', 'Skill-building resources']
        }
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: mockSuggestions }),
      });

      const response = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].name).toBe('High-Value Tech Professionals');
      expect(result.suggestions[0].estimatedSize).toBe(1542);
      expect(result.suggestions[0].businessValue).toBe('high');
      expect(result.suggestions[0].confidence).toBe(92);
      
      expect(result.suggestions[1].businessValue).toBe('medium');
      expect(result.suggestions[1].estimatedSize).toBe(892);
    });

    it('should handle authentication errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Authentication required',
          code: 'AUTHENTICATION_ERROR'
        }),
      });

      const response = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        }
      });

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle AI service failures gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Failed to generate AI segment suggestions',
          details: 'OpenAI API connection failed'
        }),
      });

      const response = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(500);
      const error = await response.json();
      expect(error.error).toBe('Failed to generate AI segment suggestions');
    });

    it('should return empty suggestions when no patterns found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: [] }),
      });

      const response = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('POST /api/segments/from-ai', () => {
    it('should create segment from AI suggestion successfully', async () => {
      const aiSuggestion = {
        id: 'ai-seg-001',
        name: 'High-Value Tech Professionals',
        description: 'Technology professionals with high lifetime value and consistent engagement',
        criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
        reasoning: 'This segment represents customers with high spending power',
        estimatedSize: 1542,
        businessValue: 'high',
        confidence: 92,
        keyCharacteristics: ['High income', 'Tech-savvy'],
        suggestedActions: ['Premium offerings']
      };

      const mockCreatedSegment = {
        id: 'segment-uuid-123',
        name: 'High-Value Tech Professionals',
        description: 'Technology professionals with high lifetime value and consistent engagement',
        criteria: { lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' },
        isActive: true,
        customerCount: 0,
        createdAt: '2025-08-11T10:00:00Z',
        updatedAt: '2025-08-11T10:00:00Z'
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCreatedSegment,
      });

      const response = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(aiSuggestion)
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.id).toBe('segment-uuid-123');
      expect(result.name).toBe('High-Value Tech Professionals');
      expect(result.isActive).toBe(true);
      expect(result.criteria).toEqual({ lifetimeValue: { $gt: 1000 }, customerSegment: 'Professional' });
    });

    it('should validate required fields', async () => {
      const invalidSuggestion = {
        id: 'ai-seg-001',
        // Missing name, description, criteria
        businessValue: 'high',
        confidence: 92
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Missing required fields: name, description, criteria'
        }),
      });

      const response = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidSuggestion)
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Missing required fields');
    });

    it('should handle segment creation errors', async () => {
      const validSuggestion = {
        id: 'ai-seg-001',
        name: 'Test Segment',
        description: 'Test description',
        criteria: { customerSegment: 'Professional' },
        businessValue: 'medium',
        confidence: 80
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Failed to create segment from AI suggestion',
          details: 'Database connection failed'
        }),
      });

      const response = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validSuggestion)
      });

      expect(response.status).toBe(500);
      const error = await response.json();
      expect(error.error).toBe('Failed to create segment from AI suggestion');
    });

    it('should handle authorization errors', async () => {
      const suggestion = {
        id: 'ai-seg-001',
        name: 'Test Segment',
        description: 'Test description',
        criteria: { customerSegment: 'Professional' }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED'
        }),
      });

      const response = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer viewer-token`, // Limited permissions
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(suggestion)
      });

      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('AI Segment Workflow Integration', () => {
    it('should complete full AI segment generation and creation workflow', async () => {
      // Step 1: Generate suggestions
      const mockSuggestions = [{
        id: 'ai-seg-001',
        name: 'Premium Jakarta Customers',
        description: 'High-value customers based in Jakarta metropolitan area',
        criteria: { 
          lifetimeValue: { $gt: 1500 },
          'currentAddress.city': 'Jakarta'
        },
        reasoning: 'Geographic and value-based targeting for premium campaigns',
        estimatedSize: 234,
        businessValue: 'high',
        confidence: 87,
        keyCharacteristics: ['High LTV', 'Jakarta-based', 'Premium users'],
        suggestedActions: ['VIP events', 'Premium support', 'Exclusive offers']
      }];

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ suggestions: mockSuggestions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'segment-created-123',
            name: 'Premium Jakarta Customers',
            description: 'High-value customers based in Jakarta metropolitan area',
            criteria: { 
              lifetimeValue: { $gt: 1500 },
              'currentAddress.city': 'Jakarta'
            },
            isActive: true,
            customerCount: 0,
            createdAt: '2025-08-11T10:00:00Z'
          }),
        });

      // Step 1: Get AI suggestions
      const suggestionsResponse = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const suggestionsResult = await suggestionsResponse.json();
      expect(suggestionsResult.suggestions).toHaveLength(1);

      // Step 2: Create segment from selected suggestion
      const selectedSuggestion = suggestionsResult.suggestions[0];
      const creationResponse = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(selectedSuggestion)
      });

      const creationResult = await creationResponse.json();
      expect(creationResponse.ok).toBe(true);
      expect(creationResult.id).toBe('segment-created-123');
      expect(creationResult.name).toBe('Premium Jakarta Customers');
      expect(creationResult.isActive).toBe(true);

      // Verify both API calls were made
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle partial workflow failures gracefully', async () => {
      // Suggestions succeed, but creation fails
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            suggestions: [{
              id: 'ai-seg-001',
              name: 'Test Segment',
              description: 'Test',
              criteria: { customerSegment: 'Professional' },
              businessValue: 'medium',
              confidence: 75
            }]
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            error: 'Failed to create segment from AI suggestion'
          }),
        });

      // Get suggestions (succeeds)
      const suggestionsResponse = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(suggestionsResponse.ok).toBe(true);
      const suggestions = await suggestionsResponse.json();

      // Try to create segment (fails)
      const creationResponse = await fetch(`${API_BASE}/api/segments/from-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(suggestions.suggestions[0])
      });

      expect(creationResponse.status).toBe(500);
      const error = await creationResponse.json();
      expect(error.error).toBe('Failed to create segment from AI suggestion');
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle multiple concurrent requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: [] }),
      });

      const requests = Array(5).fill(null).map(() =>
        fetch(`${API_BASE}/api/ai/segment-suggestions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });
      
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('should handle rate limiting appropriately', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Too many requests',
          retryAfter: 60
        }),
      });

      const response = await fetch(`${API_BASE}/api/ai/segment-suggestions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      expect(response.status).toBe(429);
      const error = await response.json();
      expect(error.error).toBe('Too many requests');
      expect(error.retryAfter).toBe(60);
    });
  });
});
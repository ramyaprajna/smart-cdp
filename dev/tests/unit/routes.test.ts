// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { registerRoutes } from '@server/routes';
import { storage } from '@server/storage';
import { aiSegmentService } from '@server/services/ai-segment-service';
import { generateToken } from '@server/jwt-utils';

vi.mock('@server/storage');
vi.mock('@server/services/ai-segment-service');
vi.mock('@server/services/application-logger');
vi.mock('@server/chatbot-service');
vi.mock('@server/data-lineage-service');
vi.mock('@server/cache');
vi.mock('@server/vector-engine');

describe('Routes - Health Check Endpoints', () => {
  let app: Express;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should respond to /health endpoint with 200 status', async () => {
    const response = await request(app).get('/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service', 'Smart CDP Platform');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memory');
  });

  it('should respond to /api health check with HEAD request', async () => {
    const response = await request(app).head('/api');
    expect(response.status).toBe(200);
  });

  it('should respond to /api health check with GET request', async () => {
    const response = await request(app).get('/api');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service', 'Smart CDP Platform API');
    expect(response.body).toHaveProperty('version', '1.0.0');
  });

  it('should respond to root / endpoint for health check', async () => {
    process.env.NODE_ENV = 'production';
    
    const response = await request(app)
      .get('/')
      .set('Accept', 'application/json');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    
    delete process.env.NODE_ENV;
  });
});

describe('Routes - Anti-Crawler Middleware', () => {
  let app: Express;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
  });

  it('should block crawler user agents on non-API routes', async () => {
    const response = await request(app)
      .get('/some-page')
      .set('User-Agent', 'Googlebot/2.1');
    
    expect(response.status).toBe(403);
    expect(response.text).toContain('Access denied for web crawlers');
  });

  it('should allow crawler user agents on API routes', async () => {
    vi.mocked(storage.getCustomers).mockResolvedValue({ 
      customers: [], 
      total: 0 
    });

    const response = await request(app)
      .get('/api/customers')
      .set('User-Agent', 'Googlebot/2.1');
    
    expect(response.status).not.toBe(403);
  });

  it('should set anti-crawler headers on all responses', async () => {
    const response = await request(app).get('/health');
    
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive, nosnippet, noimageindex');
    expect(response.headers['cache-control']).toContain('no-cache');
    expect(response.headers['pragma']).toBe('no-cache');
  });
});

describe('Routes - Customer Endpoints', () => {
  let app: Express;
  let authToken: string;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
    
    authToken = generateToken({
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      isActive: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/customers', () => {
    it('should fetch customers with pagination', async () => {
      const mockCustomers = [
        { id: '1', email: 'customer1@example.com', firstName: 'John', lastName: 'Doe' },
        { id: '2', email: 'customer2@example.com', firstName: 'Jane', lastName: 'Smith' }
      ] as any;

      vi.mocked(storage.getCustomers).mockResolvedValue({
        customers: mockCustomers,
        total: 2
      });

      const response = await request(app)
        .get('/api/customers?offset=0&limit=50')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(2);
      expect(storage.getCustomers).toHaveBeenCalledWith(0, 50);
    });

    it('should use default pagination values when not provided', async () => {
      vi.mocked(storage.getCustomers).mockResolvedValue({
        customers: [],
        total: 0
      });

      await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(storage.getCustomers).toHaveBeenCalledWith(0, 50);
    });

    it('should handle errors when fetching customers', async () => {
      vi.mocked(storage.getCustomers).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch customers');
    });
  });

  describe('GET /api/customers/search', () => {
    it('should search customers by query', async () => {
      const mockCustomers = [
        { id: '1', email: 'john@example.com', firstName: 'John', lastName: 'Doe' }
      ] as any;

      vi.mocked(storage.searchCustomers).mockResolvedValue(mockCustomers);

      const response = await request(app)
        .get('/api/customers/search?q=john')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(storage.searchCustomers).toHaveBeenCalledWith('john');
    });

    it('should return 400 when query parameter is missing', async () => {
      const response = await request(app)
        .get('/api/customers/search')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', "Query parameter 'q' is required");
    });

    it('should handle search errors', async () => {
      vi.mocked(storage.searchCustomers).mockRejectedValue(new Error('Search error'));

      const response = await request(app)
        .get('/api/customers/search?q=test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Search failed');
    });
  });

  describe('POST /api/customers/filter', () => {
    it('should filter customers by criteria', async () => {
      const mockCustomers = [
        { id: '1', email: 'test@example.com', city: 'Jakarta' }
      ] as any;

      vi.mocked(storage.getFilteredCustomers).mockResolvedValue(mockCustomers);

      const response = await request(app)
        .post('/api/customers/filter')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ city: 'Jakarta' });

      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(1);
      expect(storage.getFilteredCustomers).toHaveBeenCalledWith({ city: 'Jakarta' });
    });

    it('should handle filter errors', async () => {
      vi.mocked(storage.getFilteredCustomers).mockRejectedValue(new Error('Filter error'));

      const response = await request(app)
        .post('/api/customers/filter')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ city: 'Jakarta' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Filter failed');
    });
  });

  describe('GET /api/customers/:id', () => {
    it('should fetch a customer by ID', async () => {
      const mockCustomer = {
        id: 'customer-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      } as any;

      vi.mocked(storage.getCustomer).mockResolvedValue(mockCustomer);

      const response = await request(app)
        .get('/api/customers/customer-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCustomer);
      expect(storage.getCustomer).toHaveBeenCalledWith('customer-123');
    });

    it('should return 404 when customer not found', async () => {
      vi.mocked(storage.getCustomer).mockResolvedValue(undefined as any);

      const response = await request(app)
        .get('/api/customers/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Customer not found');
    });

    it('should handle errors when fetching customer', async () => {
      vi.mocked(storage.getCustomer).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/customers/customer-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch customer');
    });
  });

  describe('POST /api/customers', () => {
    it('should create a new customer', async () => {
      const newCustomer = {
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'Customer'
      };

      const createdCustomer = {
        id: 'new-customer-id',
        ...newCustomer
      } as any;

      vi.mocked(storage.createCustomer).mockResolvedValue(createdCustomer);

      const response = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newCustomer);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createdCustomer);
    });

    it('should return 400 for invalid customer data', async () => {
      const response = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalidField: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid customer data');
    });

    it('should handle creation errors', async () => {
      vi.mocked(storage.createCustomer).mockRejectedValue(new Error('Creation error'));

      const response = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to create customer');
    });
  });

  describe('PUT /api/customers/:id', () => {
    it('should update a customer', async () => {
      const updateData = { firstName: 'Updated' };
      const updatedCustomer = {
        id: 'customer-123',
        email: 'test@example.com',
        firstName: 'Updated',
        lastName: 'User'
      } as any;

      vi.mocked(storage.updateCustomer).mockResolvedValue(updatedCustomer);

      const response = await request(app)
        .put('/api/customers/customer-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedCustomer);
      expect(storage.updateCustomer).toHaveBeenCalledWith('customer-123', updateData);
    });

    it('should return 400 for invalid update data', async () => {
      const response = await request(app)
        .put('/api/customers/customer-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
    });

    it('should handle update errors', async () => {
      vi.mocked(storage.updateCustomer).mockRejectedValue(new Error('Update error'));

      const response = await request(app)
        .put('/api/customers/customer-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to update customer');
    });
  });
});

describe('Routes - Segment Endpoints', () => {
  let app: Express;
  let authToken: string;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
    
    authToken = generateToken({
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      isActive: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/segments', () => {
    it('should fetch all segments with customer counts', async () => {
      const mockSegments = [
        {
          id: 'segment-1',
          name: 'Professional',
          description: 'Working professionals',
          criteria: JSON.stringify({ profession: 'Engineer' }),
          isActive: true,
          createdAt: null,
          updatedAt: null,
          customerCount: null
        }
      ] as any;

      vi.mocked(storage.getSegments).mockResolvedValue(mockSegments);
      vi.mocked(storage.getCustomerCountByCriteria).mockResolvedValue(100);
      vi.mocked(storage.getSegmentAnalytics).mockResolvedValue({
        avgDataQuality: 90,
        topCities: ['Jakarta'],
        genderDistribution: { male: 50, female: 50, unknown: 0 }
      } as any);

      const response = await request(app)
        .get('/api/segments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('customerCount', 100);
    });

    it('should handle errors when fetching segments', async () => {
      vi.mocked(storage.getSegments).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/segments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch segments');
    });
  });

  describe('GET /api/segments/metrics/:segmentId', () => {
    it('should fetch metrics for a specific segment', async () => {
      const mockSegments = [
        {
          id: 'segment-123',
          name: 'Professional',
          description: 'Working professionals',
          criteria: JSON.stringify({ profession: 'Engineer' }),
          isActive: true,
          createdAt: null,
          updatedAt: null,
          customerCount: null
        }
      ] as any;

      vi.mocked(storage.getSegments).mockResolvedValue(mockSegments);
      vi.mocked(storage.getCustomerCountByCriteria).mockResolvedValue(50);

      const response = await request(app)
        .get('/api/segments/metrics/segment-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'segment-123');
      expect(response.body).toHaveProperty('customerCount', 50);
      expect(response.body).toHaveProperty('avgDataQuality');
    });

    it('should return 404 when segment not found', async () => {
      vi.mocked(storage.getSegments).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/segments/metrics/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Segment not found');
    });

    it('should return 400 for invalid segment ID', async () => {
      const response = await request(app)
        .get('/api/segments/metrics/ ')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid segment ID provided');
    });
  });

  describe('POST /api/segments', () => {
    it('should create a new segment', async () => {
      const newSegment = {
        name: 'New Segment',
        description: 'Test segment',
        criteria: JSON.stringify({ age: { min: 18, max: 30 } }),
        isActive: true
      };

      const createdSegment = {
        id: 'new-segment-id',
        ...newSegment,
        createdAt: null,
        updatedAt: null,
        customerCount: null
      } as any;

      vi.mocked(storage.createSegment).mockResolvedValue(createdSegment);

      const response = await request(app)
        .post('/api/segments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSegment);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createdSegment);
    });

    it('should return 400 for invalid segment data', async () => {
      const response = await request(app)
        .post('/api/segments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalidField: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid segment data');
    });
  });

  describe('PATCH /api/segments/:id', () => {
    it('should update a segment', async () => {
      const updateData = { name: 'Updated Segment' };
      const updatedSegment = {
        id: 'segment-123',
        name: 'Updated Segment',
        description: 'Test segment',
        isActive: true,
        createdAt: null,
        updatedAt: null,
        criteria: null,
        customerCount: null
      } as any;

      vi.mocked(storage.updateSegment).mockResolvedValue(updatedSegment);

      const response = await request(app)
        .patch('/api/segments/segment-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSegment);
      expect(storage.updateSegment).toHaveBeenCalledWith('segment-123', updateData);
    });

    it('should handle update errors', async () => {
      vi.mocked(storage.updateSegment).mockRejectedValue(new Error('Update error'));

      const response = await request(app)
        .patch('/api/segments/segment-123')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to update segment');
    });
  });
});

describe('Routes - AI Segment Generation', () => {
  let app: Express;
  let authToken: string;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
    
    authToken = generateToken({
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      isActive: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/ai/segment-suggestions', () => {
    it('should generate AI segment suggestions', async () => {
      const mockSuggestions = [
        {
          id: 'suggestion-1',
          name: 'High-Value Customers',
          description: 'Customers with high lifetime value',
          reasoning: 'Based on customer data analysis',
          criteria: { lifetimeValue: { min: 1000 } },
          confidence: 85,
          businessValue: 'high',
          estimatedSize: 150,
          keyCharacteristics: ['high value', 'engaged'],
          suggestedActions: ['target with premium offers']
        }
      ] as any;

      vi.mocked(aiSegmentService.generateSegmentSuggestions).mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .post('/api/ai/segment-suggestions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('suggestions');
      expect(response.body.suggestions).toHaveLength(1);
      expect(response.body.suggestions[0]).toHaveProperty('name', 'High-Value Customers');
    });

    it('should handle AI generation errors', async () => {
      vi.mocked(aiSegmentService.generateSegmentSuggestions).mockRejectedValue(
        new Error('AI service unavailable')
      );

      const response = await request(app)
        .post('/api/ai/segment-suggestions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to generate AI segment suggestions');
    });
  });

  describe('POST /api/segments/from-ai', () => {
    it('should create segment from AI suggestion', async () => {
      const aiSegment = {
        name: 'AI Segment',
        description: 'AI-generated segment',
        criteria: { age: { min: 25, max: 35 } }
      };

      const createdSegment = {
        id: 'ai-segment-id',
        ...aiSegment,
        isActive: true,
        createdAt: null,
        updatedAt: null,
        customerCount: null
      } as any;

      vi.mocked(storage.createSegment).mockResolvedValue(createdSegment);

      const response = await request(app)
        .post('/api/segments/from-ai')
        .set('Authorization', `Bearer ${authToken}`)
        .send(aiSegment);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createdSegment);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/segments/from-ai')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Incomplete' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should handle creation errors', async () => {
      vi.mocked(storage.createSegment).mockRejectedValue(new Error('Creation failed'));

      const response = await request(app)
        .post('/api/segments/from-ai')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test',
          description: 'Test',
          criteria: {}
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to create segment from AI suggestion');
    });
  });

  describe('POST /api/ai/test', () => {
    it('should verify AI endpoint authentication', async () => {
      const response = await request(app)
        .post('/api/ai/test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'AI endpoint authentication working');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});

describe('Routes - Analytics Endpoints', () => {
  let app: Express;
  let authToken: string;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
    
    authToken = generateToken({
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      isActive: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/analytics/stats', () => {
    it('should fetch dashboard statistics', async () => {
      const mockStats = {
        totalCustomers: 1000,
        activeSegments: 5,
        avgDataQuality: 85.5,
        newCustomersThisMonth: 50,
        totalEmbeddings: 800
      };

      vi.mocked(storage.getCustomerStats).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/analytics/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
    });

    it('should return default values on error', async () => {
      vi.mocked(storage.getCustomerStats).mockRejectedValue(new Error('Stats error'));

      const response = await request(app)
        .get('/api/analytics/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('totalCustomers', 0);
      expect(response.body).toHaveProperty('activeSegments', 0);
      expect(response.body).toHaveProperty('avgDataQuality', 0);
    });
  });
});

describe('Routes - Customer Events', () => {
  let app: Express;
  let authToken: string;

  beforeEach(async () => {
    app = express();
    await registerRoutes(app);
    
    authToken = generateToken({
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      isActive: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/customers/:id/events', () => {
    it('should fetch customer events', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          customerId: 'customer-123',
          eventType: 'purchase',
          eventData: { amount: 100 },
          timestamp: new Date().toISOString()
        }
      ] as any;

      vi.mocked(storage.getCustomerEvents).mockResolvedValue(mockEvents);

      const response = await request(app)
        .get('/api/customers/customer-123/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockEvents);
      expect(storage.getCustomerEvents).toHaveBeenCalledWith('customer-123');
    });

    it('should handle errors when fetching events', async () => {
      vi.mocked(storage.getCustomerEvents).mockRejectedValue(new Error('Events error'));

      const response = await request(app)
        .get('/api/customers/customer-123/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch customer events');
    });
  });

  describe('POST /api/customers/:id/events', () => {
    it('should create a customer event', async () => {
      const newEvent = {
        eventType: 'purchase',
        eventData: { amount: 100 }
      };

      const createdEvent = {
        id: 'new-event-id',
        customerId: 'customer-123',
        ...newEvent,
        timestamp: new Date().toISOString()
      } as any;

      vi.mocked(storage.createCustomerEvent).mockResolvedValue(createdEvent);

      const response = await request(app)
        .post('/api/customers/customer-123/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newEvent);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createdEvent);
    });

    it('should return 400 for invalid event data', async () => {
      const response = await request(app)
        .post('/api/customers/customer-123/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalidField: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid event data');
    });
  });
});

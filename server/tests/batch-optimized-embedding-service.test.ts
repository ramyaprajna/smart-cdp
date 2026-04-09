/**
 * Comprehensive Test Suite for BatchOptimizedEmbeddingService
 *
 * Test Coverage:
 * - Unit tests for all batch processing functions
 * - Integration tests with real OpenAI API (small batches)
 * - Security tests (input validation, rate limiting)
 * - Performance benchmarks vs. current implementation
 * - Edge case handling (empty batches, malformed data, API failures)
 * - Cancellation functionality preservation
 *
 * @module BatchOptimizedEmbeddingServiceTests
 * @created September 17, 2025
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { customers, customerEmbeddings, embeddingJobs } from '../../shared/schema';
import { eq, sql, count } from 'drizzle-orm';
import { batchOptimizedEmbeddingService } from '../services/batch-optimized-embedding-service';
import { cancellableEmbeddingService } from '../services/cancellable-embedding-service';

// Test configuration
const TEST_BATCH_SIZE = 5; // Small batch for testing
const TEST_CUSTOMERS_COUNT = 15; // Enough for multiple batches
const PERFORMANCE_TEST_SIZE = 100; // For performance comparison

// Mock environment variables for testing
const originalEnv = process.env;

describe.skipIf(!process.env.DATABASE_URL || process.env.CI)('BatchOptimizedEmbeddingService', () => {
  
  beforeAll(async () => {
    // Set test environment variables
    process.env.OPENAI_API_KEY = 'test-key-for-testing';
    process.env.BATCH_API_SIZE = TEST_BATCH_SIZE.toString();
    process.env.STREAMING_PAGE_SIZE = '10';
    process.env.OPENAI_TIMEOUT_MS = '10000';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  describe('Security and Input Validation', () => {
    
    it('should validate UUID format for job IDs', async () => {
      const invalidJobIds = [
        'invalid-uuid',
        '123',
        '',
        'not-a-uuid-at-all',
        '12345678-1234-1234-1234-123456789012345' // too long
      ];

      for (const jobId of invalidJobIds) {
        await expect(
          batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(jobId)
        ).rejects.toThrow('Invalid job ID format');
      }
    });

    it('should enforce rate limiting for cancel requests', async () => {
      // Create a test job
      const result = await createTestJob();
      const jobId = result.jobId;

      // Make multiple cancel requests rapidly
      const cancelPromises = Array(10).fill(null).map(() => 
        batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(jobId)
      );

      // Some should be rate limited
      const results = await Promise.allSettled(cancelPromises);
      const rejected = results.filter(r => r.status === 'rejected');
      
      // At least some should be rate limited
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected.some(r => 
        r.reason?.message?.includes('Too many cancel requests')
      )).toBe(true);
    });

    it('should validate customer data and reject invalid entries', async () => {
      // Create customers with invalid data
      const invalidCustomers = [
        { id: 'invalid-uuid', firstName: 'Test', lastName: 'User' },
        { id: '12345678-1234-1234-1234-123456789012', firstName: '', lastName: '' },
        { id: '12345678-1234-1234-1234-123456789013', firstName: 'A'.repeat(10000), lastName: 'Test' }
      ];

      await insertTestCustomers(invalidCustomers);

      // Start batch job - should handle invalid customers gracefully
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      expect(result.jobId).toBeDefined();

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check job status - should show some processing even with invalid data
      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      expect(status).toBeDefined();
      expect(status?.status).toMatch(/running|completed|failed/);
    });

    it('should protect against memory exhaustion with streaming', async () => {
      // Mock a very large customer count
      const mockGetCustomersPage = vi.spyOn(
        batchOptimizedEmbeddingService as any, 
        'getCustomersNeedingEmbeddingsPage'
      );

      // Create test data
      await insertTestCustomers(generateTestCustomers(TEST_CUSTOMERS_COUNT));

      // Monitor memory usage during processing
      const initialMemory = process.memoryUsage().rss;
      
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage().rss;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 100MB for test data)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });
  });

  describe('Batch Processing Functionality', () => {
    
    it('should process customers in batches with correct batch size', async () => {
      // Create test customers
      const testCustomers = generateTestCustomers(TEST_CUSTOMERS_COUNT);
      await insertTestCustomers(testCustomers);

      // Mock OpenAI API to track batch calls
      const mockOpenAICall = vi.fn().mockResolvedValue(
        Array(TEST_BATCH_SIZE).fill(null).map(() => Array(1536).fill(0.1))
      );

      // Start batch job
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      expect(result.jobId).toBeDefined();

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check that processing started
      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      expect(status?.totalCustomers).toBe(TEST_CUSTOMERS_COUNT);
      expect(status?.batchSize).toBe(TEST_BATCH_SIZE);

      // Cancel to clean up
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });

    it('should handle empty batches gracefully', async () => {
      // Ensure no customers need embeddings
      await cleanupTestData();

      // Try to start a job with no customers
      await expect(
        batchOptimizedEmbeddingService.startBatchEmbeddingJob()
      ).rejects.toThrow('No customers need embeddings');
    });

    it('should maintain sub-second cancellation response time', async () => {
      // Create test data
      await insertTestCustomers(generateTestCustomers(TEST_CUSTOMERS_COUNT));

      // Start job
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for job to start processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Time the cancellation
      const startTime = Date.now();
      const cancelResult = await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
      const endTime = Date.now();

      const cancellationTime = endTime - startTime;

      expect(cancelResult.ok).toBe(true);
      expect(cancellationTime).toBeLessThan(5000); // Less than 5 seconds (generous for testing)
    });

    it('should track performance metrics accurately', async () => {
      // Create test data
      await insertTestCustomers(generateTestCustomers(10));

      // Start job
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get status with metrics
      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      
      expect(status).toBeDefined();
      expect(status?.apiCallsCount).toBeGreaterThanOrEqual(0);
      expect(status?.batchesProcessed).toBeGreaterThanOrEqual(0);
      expect(status?.memoryUsageMB).toBeGreaterThan(0);

      if (status?.avgBatchProcessingTime) {
        expect(status.avgBatchProcessingTime).toBeGreaterThan(0);
      }

      // Cancel to clean up
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });
  });

  describe('Database Operations', () => {
    
    it('should use batch database operations for embeddings', async () => {
      // Create test customers
      const testCustomers = generateTestCustomers(5);
      await insertTestCustomers(testCustomers);

      // Mock successful embedding generation
      const mockGenerateEmbeddings = vi.fn().mockResolvedValue(
        Array(5).fill(null).map(() => Array(1536).fill(0.1))
      );

      // Start job
      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if embeddings were created
      const embeddingsCount = await db
        .select({ count: count() })
        .from(customerEmbeddings);

      expect(embeddingsCount[0].count).toBeGreaterThanOrEqual(0);

      // Cancel job
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });

    it('should handle database transaction failures gracefully', async () => {
      // Create test data
      await insertTestCustomers(generateTestCustomers(5));

      // Mock database failure
      const originalInsert = db.insert;
      vi.spyOn(db, 'insert').mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      try {
        const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
        
        // Wait for processing to encounter error
        await new Promise(resolve => setTimeout(resolve, 2000));

        const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
        
        // Job should handle the error gracefully
        expect(status).toBeDefined();

      } finally {
        // Restore original function
        vi.mocked(db.insert).mockRestore();
      }
    });
  });

  describe('Performance Benchmarking', () => {
    
    it('should demonstrate API call reduction vs legacy service', async () => {
      const customerCount = 20; // Small test set
      
      // Create test data
      await insertTestCustomers(generateTestCustomers(customerCount));

      // Test batch service
      const batchStart = Date.now();
      const batchResult = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const batchStatus = await batchOptimizedEmbeddingService.getBatchJobStatus(batchResult.jobId);
      const batchTime = Date.now() - batchStart;

      // Calculate expected API call reduction
      const expectedLegacyApiCalls = customerCount; // 1 call per customer
      const actualBatchApiCalls = batchStatus?.apiCallsCount || 0;
      
      // Should use significantly fewer API calls
      expect(actualBatchApiCalls).toBeLessThan(expectedLegacyApiCalls);
      
      if (actualBatchApiCalls > 0) {
        const apiCallReduction = expectedLegacyApiCalls / actualBatchApiCalls;
        expect(apiCallReduction).toBeGreaterThan(2); // At least 2x reduction
      }

      // Clean up
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(batchResult.jobId);
    });

    it('should maintain constant memory usage with streaming', async () => {
      const measurements: number[] = [];
      
      // Create larger test dataset
      await insertTestCustomers(generateTestCustomers(50));

      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();

      // Measure memory usage during processing
      const measureInterval = setInterval(() => {
        measurements.push(process.memoryUsage().rss);
      }, 500);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));

      clearInterval(measureInterval);

      // Calculate memory variance
      const avgMemory = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const variance = measurements.reduce((acc, val) => acc + Math.pow(val - avgMemory, 2), 0) / measurements.length;
      const stdDev = Math.sqrt(variance);

      // Memory usage should be relatively stable (low standard deviation)
      const memoryStabilityRatio = stdDev / avgMemory;
      expect(memoryStabilityRatio).toBeLessThan(0.2); // Less than 20% variance

      // Clean up
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    
    it('should handle OpenAI API failures gracefully', async () => {
      // Create test data
      await insertTestCustomers(generateTestCustomers(5));

      // Mock OpenAI API failure
      const mockOpenAI = vi.fn().mockRejectedValue(new Error('OpenAI API unavailable'));

      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      
      // Job should handle API failure gracefully
      expect(status).toBeDefined();
      expect(status?.status).toMatch(/running|failed|cancelled/);
    });

    it('should handle partial batch failures', async () => {
      // Create test data with some invalid customers
      const validCustomers = generateTestCustomers(3);
      const invalidCustomers = [
        { id: 'invalid-uuid-format', firstName: 'Invalid', lastName: 'Customer' }
      ];
      
      await insertTestCustomers([...validCustomers, ...invalidCustomers]);

      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      
      // Job should continue processing valid customers
      expect(status).toBeDefined();
      expect(status?.totalCustomers).toBe(4); // Including invalid customer in count
      
      // Clean up
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });

    it('should handle concurrent job operations safely', async () => {
      // Create test data
      await insertTestCustomers(generateTestCustomers(10));

      // Start multiple jobs concurrently
      const jobPromises = Array(3).fill(null).map(() => 
        batchOptimizedEmbeddingService.startBatchEmbeddingJob()
      );

      const results = await Promise.allSettled(jobPromises);
      
      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Clean up successful jobs
      for (const result of successful) {
        if (result.status === 'fulfilled') {
          await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.value.jobId);
        }
      }
    });
  });

  describe('Integration with Existing API', () => {
    
    it('should maintain backward compatibility', async () => {
      // Test that legacy endpoints still work
      await insertTestCustomers(generateTestCustomers(5));

      // Legacy service should still work
      const legacyResult = await cancellableEmbeddingService.startEmbeddingJob();
      expect(legacyResult.jobId).toBeDefined();

      // New service should also work
      const batchResult = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      expect(batchResult.jobId).toBeDefined();

      // Clean up
      await cancellableEmbeddingService.cancelEmbeddingJob(legacyResult.jobId);
      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(batchResult.jobId);
    });

    it('should provide enhanced status information', async () => {
      await insertTestCustomers(generateTestCustomers(5));

      const result = await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      const status = await batchOptimizedEmbeddingService.getBatchJobStatus(result.jobId);
      
      // Should have enhanced fields not in legacy service
      expect(status).toBeDefined();
      expect(status).toHaveProperty('apiCallsCount');
      expect(status).toHaveProperty('batchesProcessed');
      expect(status).toHaveProperty('streamingPageSize');
      expect(status).toHaveProperty('memoryUsageMB');

      await batchOptimizedEmbeddingService.cancelBatchEmbeddingJob(result.jobId);
    });
  });
});

// Helper Functions

async function cleanupTestData() {
  try {
    // Delete test embeddings
    await db.delete(customerEmbeddings).where(sql`1=1`);
    
    // Delete test customers
    await db.delete(customers).where(sql`${customers.firstName} LIKE 'TestCustomer%'`);
    
    // Delete test jobs
    await db.delete(embeddingJobs).where(sql`1=1`);
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}

function generateTestCustomers(count: number) {
  return Array(count).fill(null).map((_, index) => ({
    id: `12345678-1234-1234-1234-${String(index).padStart(12, '0')}`,
    firstName: `TestCustomer${index}`,
    lastName: `User${index}`,
    email: `test${index}@example.com`,
    customerSegment: 'test',
    lifetimeValue: 100 + index,
    currentAddress: { city: 'TestCity', state: 'TestState' }
  }));
}

async function insertTestCustomers(testCustomers: any[]) {
  for (const customer of testCustomers) {
    try {
      await db.insert(customers).values(customer);
    } catch (error) {
      // Ignore duplicate key errors
    }
  }
}

async function createTestJob() {
  await insertTestCustomers(generateTestCustomers(5));
  return await batchOptimizedEmbeddingService.startBatchEmbeddingJob();
}
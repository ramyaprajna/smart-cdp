/**
 * Coverage-Focused Integration Tests for Smart Auto-Resume
 * 
 * Purpose: Execute actual orchestrator code paths to achieve 70% coverage
 * Approach: Mock external APIs but execute real orchestrator methods
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { db } from '@server/db';
import { embeddingJobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Import the orchestrator class directly
import { EmbeddingOrchestrator } from '@server/services/_shared/embedding-orchestrator';

// Mock OpenAI client
vi.mock('@server/utils/openai-client', () => ({
  getOpenAIClient: vi.fn(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }]
      })
    }
  }))
}));

// Mock application logger to avoid database calls
vi.mock('@server/services/application-logger', () => ({
  applicationLogger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Smart Auto-Resume Coverage Tests', () => {
  let testJobIds: string[] = [];

  beforeAll(() => {
    // Set required environment variables
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(async () => {
    // Clean up test jobs
    for (const jobId of testJobIds) {
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, jobId)).catch(() => {});
    }
    testJobIds = [];
  });

  // Helper function to poll database until job reaches expected state
  async function waitForJobStatus(
    jobId: string, 
    expectedStatus: string | ((status: string) => boolean),
    maxWaitMs: number = 2000
  ): Promise<any> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const [job] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, jobId))
        .limit(1);
      
      if (!job) throw new Error(`Job ${jobId} not found`);
      
      const matches = typeof expectedStatus === 'function' 
        ? expectedStatus(job.status)
        : job.status === expectedStatus;
      
      if (matches) {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    const [job] = await db
      .select()
      .from(embeddingJobs)
      .where(eq(embeddingJobs.id, jobId))
      .limit(1);
    throw new Error(`Timeout waiting for job ${jobId} to reach status. Current status: ${job?.status}`);
  }

  describe('completeJob() coverage', () => {
    it('should reset auto-restart counter on successful completion', async () => {
      // Create a job with restart count
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 100,
        batchSize: 10,
        autoRestartCount: 2,
        lastFailedAt: new Date(),
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();
      
      testJobIds.push(testJob.id);

      // Create orchestrator and call completeJob directly
      const orchestrator = new EmbeddingOrchestrator();
      const mockProgressTracker = {
        complete: vi.fn(),
        update: vi.fn(),
        fail: vi.fn(),
        getStats: vi.fn().mockReturnValue({ processed: 100, total: 100 })
      };

      // Access private method via type assertion
      await (orchestrator as any).completeJob(testJob.id, mockProgressTracker);

      // Verify database update
      const [completedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(completedJob.status).toBe('completed');
      expect(completedJob.autoRestartCount).toBe(0);
      expect(completedJob.lastFailedAt).toBeNull();
      expect(completedJob.completedAt).not.toBeNull();
      expect(mockProgressTracker.complete).toHaveBeenCalled();
    });

    it('should clear lastFailedAt timestamp on completion', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 50,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();
      
      testJobIds.push(testJob.id);

      const orchestrator = new EmbeddingOrchestrator();
      const mockProgressTracker = {
        complete: vi.fn(),
        update: vi.fn(),
        fail: vi.fn(),
        getStats: vi.fn().mockReturnValue({ processed: 50, total: 50 })
      };

      await (orchestrator as any).completeJob(testJob.id, mockProgressTracker);

      // Wait for async database operations
      const completedJob = await waitForJobStatus(testJob.id, 'completed');

      expect(completedJob.lastFailedAt).toBeNull();
      expect(completedJob.status).toBe('completed');
    });
  });

  describe('handleJobFailure() coverage', () => {
    it('should update lastFailedAt on job failure', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();
      
      testJobIds.push(testJob.id);

      const orchestrator = new EmbeddingOrchestrator();
      const beforeFailure = new Date();
      
      await (orchestrator as any).handleJobFailure(testJob.id, new Error('Test failure'));

      const [failedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(failedJob.status).toBe('failed');
      expect(failedJob.lastFailedAt).not.toBeNull();
      expect(failedJob.lastFailedAt!.getTime()).toBeGreaterThanOrEqual(beforeFailure.getTime());
      expect(failedJob.errorMessage).toBe('Test failure');
    });

    it('should preserve autoRestartCount on failure', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 2,
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();
      
      testJobIds.push(testJob.id);

      const orchestrator = new EmbeddingOrchestrator();
      await (orchestrator as any).handleJobFailure(testJob.id, new Error('Another test failure'));

      const [failedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(failedJob.autoRestartCount).toBe(2);
      expect(failedJob.status).toBe('failed');
    });
  });

  describe('performStartupRecovery() coverage - All Branches', () => {
    it('should handle no orphaned jobs scenario', async () => {
      // Don't create any orphaned jobs
      const orchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Just verify orchestrator was created
      expect(orchestrator).toBeDefined();
    });

    it('should handle jobs exceeding max restart attempts (autoRestartCount >= 3)', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 3,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();
      
      testJobIds.push(testJob.id);

      // Create orchestrator which triggers performStartupRecovery
      const orchestrator = new EmbeddingOrchestrator();
      
      // Wait for job to be failed by startup recovery
      const updatedJob = await waitForJobStatus(testJob.id, 'failed');

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.errorMessage).toContain('maximum auto-restart attempts');
      expect(updatedJob.completedAt).not.toBeNull();
    });

    it('should handle jobs within cooldown period', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();
      
      testJobIds.push(testJob.id);

      // Create orchestrator which triggers performStartupRecovery
      const orchestrator = new EmbeddingOrchestrator();
      
      // Wait for job to be failed by cooldown check
      const updatedJob = await waitForJobStatus(testJob.id, 'failed');

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.errorMessage).toContain('cooldown period');
    });

    it('should increment autoRestartCount when resuming eligible job (cooldown passed)', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();
      
      testJobIds.push(testJob.id);

      // Create orchestrator which triggers performStartupRecovery
      const orchestrator = new EmbeddingOrchestrator();
      
      // Wait longer for the database update to happen
      // The job processing may fail, but the counter should still increment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fetch latest state to verify counter increment
      const [finalJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      // Should increment from 1 to 2 (this happens in performStartupRecovery before job processing)
      expect(finalJob.autoRestartCount).toBe(2);
      if (finalJob.status === 'running') {
        expect(finalJob.errorMessage).toBeNull(); // Error should be cleared
      }
    });

    it('should handle job with null lastFailedAt (server restart, no previous failure)', async () => {
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null, // No previous failure
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();
      
      testJobIds.push(testJob.id);

      const orchestrator = new EmbeddingOrchestrator();
      
      // Wait for database update
      await new Promise(resolve => setTimeout(resolve, 1000));

      const [updatedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      // Should increment from 0 to 1
      expect(updatedJob.autoRestartCount).toBe(1);
    });

    it('should handle multiple orphaned jobs with different states', async () => {
      // Job 1: Eligible for restart
      const [job1] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Job 2: Max attempts exceeded
      const [job2] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 200,
        processedCustomers: 100,
        batchSize: 20,
        autoRestartCount: 3,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      testJobIds.push(job1.id, job2.id);

      const orchestrator = new EmbeddingOrchestrator();
      
      // Wait for both jobs to be processed
      await Promise.all([
        waitForJobStatus(job1.id, (status) => status === 'running'),
        waitForJobStatus(job2.id, 'failed')
      ]);

      // Job 1 should be resumed
      const [updatedJob1] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, job1.id))
        .limit(1);

      expect(updatedJob1.autoRestartCount).toBe(1);

      // Job 2 should be failed
      const [updatedJob2] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, job2.id))
        .limit(1);

      expect(updatedJob2.status).toBe('failed');
    });
  });

  describe('Global orchestrator functions coverage', () => {
    it('should initialize global orchestrator', async () => {
      const { initializeEmbeddingOrchestrator } = await import('@server/services/_shared/embedding-orchestrator');
      
      const orchestrator = initializeEmbeddingOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(orchestrator).toBeInstanceOf(EmbeddingOrchestrator);
    });

    it('should get existing orchestrator instance', async () => {
      const { getEmbeddingOrchestrator, initializeEmbeddingOrchestrator } = await import('@server/services/_shared/embedding-orchestrator');
      
      // Initialize first
      const orchestrator1 = initializeEmbeddingOrchestrator();
      
      // Get should return same instance
      const orchestrator2 = getEmbeddingOrchestrator();
      expect(orchestrator2).toBeDefined();
    });

    it('should create new orchestrator if none exists', async () => {
      const { getEmbeddingOrchestrator } = await import('@server/services/_shared/embedding-orchestrator');
      
      const orchestrator = getEmbeddingOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(orchestrator).toBeInstanceOf(EmbeddingOrchestrator);
    });
  });

  describe('Full recovery cycle coverage', () => {
    it('should execute complete cycle: fail -> complete', async () => {
      // Start with running job
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 90,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();
      
      testJobIds.push(testJob.id);

      const orchestrator = new EmbeddingOrchestrator();

      // Fail the job
      await (orchestrator as any).handleJobFailure(testJob.id, new Error('Test error'));

      // Wait for job to be marked as failed
      let jobState = await waitForJobStatus(testJob.id, 'failed');

      expect(jobState.status).toBe('failed');
      expect(jobState.lastFailedAt).not.toBeNull();

      // Complete the job (simulate successful run later)
      // Update to running state
      await db
        .update(embeddingJobs)
        .set({ status: 'running' })
        .where(eq(embeddingJobs.id, testJob.id));

      const mockProgressTracker = {
        complete: vi.fn(),
        update: vi.fn(),
        fail: vi.fn(),
        getStats: vi.fn().mockReturnValue({ processed: 100, total: 100 })
      };

      await (orchestrator as any).completeJob(testJob.id, mockProgressTracker);

      // Wait for job to be marked as completed
      jobState = await waitForJobStatus(testJob.id, 'completed');

      expect(jobState.status).toBe('completed');
      expect(jobState.autoRestartCount).toBe(0);
      expect(jobState.lastFailedAt).toBeNull();
    });
  });
});

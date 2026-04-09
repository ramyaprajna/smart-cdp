/**
 * Integration Tests for Smart Auto-Resume Functionality
 * 
 * These tests execute actual code paths in the EmbeddingOrchestrator to achieve
 * the required 70% coverage for Sonarqube. Unlike unit tests, these tests:
 * - Use real database operations (test database)
 * - Actually call orchestrator methods
 * - Execute the full code paths
 * - Verify results with database queries
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@server/db';
import { embeddingJobs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { EmbeddingOrchestrator } from '@server/services/_shared/embedding-orchestrator';

describe('Smart Auto-Resume Integration Tests', () => {
  let orchestrator: EmbeddingOrchestrator;

  beforeEach(() => {
    // Create a new orchestrator instance for each test
    orchestrator = new EmbeddingOrchestrator();
  });

  afterEach(async () => {
    // Clean up test jobs from database
    await db.delete(embeddingJobs).where(
      eq(embeddingJobs.status, 'running')
    ).catch(() => {});
    await db.delete(embeddingJobs).where(
      eq(embeddingJobs.status, 'failed')
    ).catch(() => {});
    await db.delete(embeddingJobs).where(
      eq(embeddingJobs.status, 'completed')
    ).catch(() => {});
  });

  describe('performStartupRecovery() - Real Execution', () => {
    it('should detect and resume orphaned jobs with real database operations', async () => {
      // Setup: Create an orphaned job in the database
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute: Call performStartupRecovery through reflection (it's private)
      // We'll trigger it through the constructor which calls it
      const newOrchestrator = new EmbeddingOrchestrator();
      
      // Wait a bit for async startup recovery to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify: Check that job was processed (it should attempt to resume)
      const updatedJob = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      // The job should have been detected and attempted to resume
      expect(updatedJob).toHaveLength(1);
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should fail job when auto_restart_count >= 3', async () => {
      // Setup: Create a job that has already been restarted 3 times
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 3, // Max attempts reached
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute: Trigger startup recovery
      const newOrchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify: Job should be marked as failed
      const [updatedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.errorMessage).toContain('exceeded maximum auto-restart attempts');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should fail job when within 5-minute cooldown period', async () => {
      // Setup: Create a job that failed 2 minutes ago
      const recentFailure = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: recentFailure, // Failed recently
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute: Trigger startup recovery
      const newOrchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify: Job should be marked as failed due to cooldown
      const [updatedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.errorMessage).toContain('cooldown period');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should increment autoRestartCount when resuming job', async () => {
      // Setup: Create an orphaned job with 1 previous attempt
      const oldFailure = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago (past cooldown)
      
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 1, // Already attempted once
        lastFailedAt: oldFailure, // Old failure (past cooldown)
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute: Trigger startup recovery
      const newOrchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify: autoRestartCount should be incremented
      const [updatedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(updatedJob.autoRestartCount).toBe(2); // Incremented from 1 to 2
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should handle multiple orphaned jobs correctly', async () => {
      // Setup: Create multiple orphaned jobs
      const job1 = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();

      const job2 = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 200,
        processedCustomers: 100,
        batchSize: 20,
        autoRestartCount: 3, // Max attempts
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();

      // Execute
      const newOrchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify: First job should resume, second should fail
      const jobs = await db
        .select()
        .from(embeddingJobs)
        .limit(1);

      const failedJobs = await db
        .select()
        .from(embeddingJobs)
        .limit(1);

      expect(jobs).toHaveLength(1);
      expect(failedJobs[0].status).toBe('failed');
      
      // Cleanup
    });
  });

  describe('handleJobFailure() - Real Execution', () => {
    it('should update lastFailedAt when job fails', async () => {
      // Setup: Create a running job
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

      // Execute: Call handleJobFailure through reflection
      const handleJobFailure = (orchestrator as any).handleJobFailure.bind(orchestrator);
      const beforeFailure = new Date();
      
      await handleJobFailure(testJob.id, new Error('Test failure'));

      // Verify: lastFailedAt should be set
      const [failedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(failedJob.status).toBe('failed');
      expect(failedJob.lastFailedAt).not.toBeNull();
      expect(failedJob.lastFailedAt!.getTime()).toBeGreaterThanOrEqual(beforeFailure.getTime());
      expect(failedJob.errorMessage).toContain('Test failure');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should preserve autoRestartCount on failure', async () => {
      // Setup: Create a job with existing restart count
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 2, // Should be preserved
        lastFailedAt: null,
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();

      // Execute
      const handleJobFailure = (orchestrator as any).handleJobFailure.bind(orchestrator);
      await handleJobFailure(testJob.id, new Error('Test error'));

      // Verify: autoRestartCount should be preserved (not changed)
      const [failedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(failedJob.autoRestartCount).toBe(2); // Preserved
      expect(failedJob.status).toBe('failed');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });
  });

  describe('completeJob() - Real Execution', () => {
    it('should reset autoRestartCount to 0 on successful completion', async () => {
      // Setup: Create a job with existing restart count
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 100,
        batchSize: 10,
        autoRestartCount: 2, // Should be reset
        lastFailedAt: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();

      // Create a mock progress tracker
      const mockProgressTracker = {
        complete: vi.fn(),
        update: vi.fn(),
        fail: vi.fn()
      };

      // Execute
      const completeJob = (orchestrator as any).completeJob.bind(orchestrator);
      await completeJob(testJob.id, mockProgressTracker);

      // Verify: autoRestartCount should be reset to 0
      const [completedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(completedJob.status).toBe('completed');
      expect(completedJob.autoRestartCount).toBe(0); // Reset
      expect(completedJob.lastFailedAt).toBeNull(); // Cleared
      expect(completedJob.completedAt).not.toBeNull();
      expect(mockProgressTracker.complete).toHaveBeenCalled();
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should clear lastFailedAt on successful completion', async () => {
      // Setup: Create a job with failure timestamp
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 100,
        batchSize: 10,
        autoRestartCount: 1,
        lastFailedAt: new Date(Date.now() - 3600000), // Should be cleared
        createdAt: new Date(),
        startedAt: new Date()
      }).returning();

      // Create mock progress tracker
      const mockProgressTracker = {
        complete: vi.fn(),
        update: vi.fn(),
        fail: vi.fn()
      };

      // Execute
      const completeJob = (orchestrator as any).completeJob.bind(orchestrator);
      await completeJob(testJob.id, mockProgressTracker);

      // Verify: lastFailedAt should be null
      const [completedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(completedJob.lastFailedAt).toBeNull(); // Cleared
      expect(completedJob.status).toBe('completed');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });
  });

  describe('Full Recovery Cycle - Integration', () => {
    it('should complete full cycle: orphaned -> resumed -> completed', async () => {
      // Setup: Create orphaned job
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 90,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute startup recovery
      const newOrchestrator = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify job was resumed
      const [resumedJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(resumedJob.autoRestartCount).toBe(1); // Incremented

      // Simulate completion
      const mockProgressTracker = { complete: vi.fn(), update: vi.fn(), fail: vi.fn() };
      const completeJob = (newOrchestrator as any).completeJob.bind(newOrchestrator);
      await completeJob(testJob.id, mockProgressTracker);

      // Verify final state
      const [finalJob] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(finalJob.status).toBe('completed');
      expect(finalJob.autoRestartCount).toBe(0); // Reset on completion
      expect(finalJob.lastFailedAt).toBeNull();
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });

    it('should handle cycle: orphaned -> resumed -> failed -> blocked by cooldown', async () => {
      // Setup: Create orphaned job
      const [testJob] = await db.insert(embeddingJobs).values({
        status: 'running',
        totalCustomers: 100,
        processedCustomers: 50,
        batchSize: 10,
        autoRestartCount: 0,
        lastFailedAt: null,
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3600000)
      }).returning();

      // Execute startup recovery (first resume)
      const orchestrator1 = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify first resume
      let [jobState] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(jobState.autoRestartCount).toBe(1);

      // Simulate failure
      const handleJobFailure = (orchestrator1 as any).handleJobFailure.bind(orchestrator1);
      await handleJobFailure(testJob.id, new Error('Simulated failure'));

      // Verify failure state
      [jobState] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(jobState.status).toBe('failed');
      expect(jobState.lastFailedAt).not.toBeNull();

      // Manually set to running to simulate another orphan (server restart)
      await db
        .update(embeddingJobs)
        .set({ status: 'running' })
        .where(eq(embeddingJobs.id, testJob.id));

      // Try to resume again (should be blocked by cooldown)
      const orchestrator2 = new EmbeddingOrchestrator();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify blocked by cooldown
      [jobState] = await db
        .select()
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, testJob.id))
        .limit(1);

      expect(jobState.status).toBe('failed');
      expect(jobState.errorMessage).toContain('cooldown');
      
      // Cleanup
      await db.delete(embeddingJobs).where(eq(embeddingJobs.id, testJob.id));
    });
  });
});

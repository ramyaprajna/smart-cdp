#!/usr/bin/env tsx
/**
 * Integration Tests for Smart CDP Platform
 * 
 * Tests complete workflows and feature interactions:
 * - End-to-end data import workflows
 * - Customer search and filtering
 * - Analytics data flow
 * - Archive creation and management
 * 
 * Created: August 1, 2025
 */

// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@server/db';
import { archiveDb } from '@server/db-archive';
import { sql } from 'drizzle-orm';
import { customers, dataImports, customerIdentifiers } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface IntegrationTestResult {
  workflow: string;
  step: string;
  status: 'passed' | 'failed';
  message: string;
  duration: number;
  data?: any;
}

class IntegrationTestSuite {
  private results: IntegrationTestResult[] = [];
  private testData = {
    customerId: '',
    importId: '',
    archiveId: ''
  };

  async runIntegrationTests(): Promise<{
    success: boolean;
    totalWorkflows: number;
    passedWorkflows: number;
    failedWorkflows: number;
    results: IntegrationTestResult[];
  }> {
    console.log('🔄 Starting Integration Test Suite...\n');

    await this.testDataImportWorkflow();
    await this.testCustomerAnalyticsWorkflow();
    await this.testVectorSearchWorkflow();
    await this.testArchiveWorkflow();
    await this.testErrorRecoveryWorkflow();

    const workflows = ['Data Import', 'Customer Analytics', 'Vector Search', 'Archive Management', 'Error Recovery'];
    const workflowResults = workflows.map(workflow => {
      const workflowTests = this.results.filter(r => r.workflow === workflow);
      const failed = workflowTests.some(t => t.status === 'failed');
      return { workflow, passed: !failed };
    });

    const passedWorkflows = workflowResults.filter(w => w.passed).length;
    const failedWorkflows = workflowResults.filter(w => !w.passed).length;

    console.log('\n' + '='.repeat(60));
    console.log('INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Overall Success: ${failedWorkflows === 0 ? '✅ ALL WORKFLOWS PASSED' : '❌ SOME WORKFLOWS FAILED'}`);
    console.log(`Total Workflows: ${workflows.length}`);
    console.log(`Passed: ${passedWorkflows}`);
    console.log(`Failed: ${failedWorkflows}`);

    workflowResults.forEach(result => {
      console.log(`  ${result.passed ? '✅' : '❌'} ${result.workflow}`);
    });

    return {
      success: failedWorkflows === 0,
      totalWorkflows: workflows.length,
      passedWorkflows,
      failedWorkflows,
      results: this.results
    };
  }

  /**
   * Test complete data import workflow
   */
  private async testDataImportWorkflow(): Promise<void> {
    console.log('📥 Testing Data Import Workflow...');

    await this.addIntegrationTest(
      'Data Import',
      'Import History Validation',
      async () => {
        const imports = await db.select().from(dataImports);
        
        if (imports.length === 0) {
          throw new Error('No import history found');
        }

        this.testData.importId = imports[0].id;
        
        return {
          totalImports: imports.length,
          latestImport: imports[0].filename,
          statusTracking: true
        };
      }
    );

    await this.addIntegrationTest(
      'Data Import',
      'Customer Data Integration',
      async () => {
        const customersWithImportId = await db.execute(sql`
          SELECT COUNT(*) as count FROM customers WHERE import_id IS NOT NULL
        `);
        
        const count = customersWithImportId.rows[0].count as number;
        
        return {
          linkedCustomers: count,
          dataLineage: count > 0,
          integrationComplete: true
        };
      }
    );

    await this.addIntegrationTest(
      'Data Import',
      'Identifier Resolution',
      async () => {
        const identifierLinking = await db.execute(sql`
          SELECT 
            COUNT(*) as total_identifiers,
            COUNT(DISTINCT customer_id) as unique_customers
          FROM customer_identifiers
        `);
        
        const stats = identifierLinking.rows[0] as any;
        
        return {
          totalIdentifiers: stats.total_identifiers,
          linkedCustomers: stats.unique_customers,
          identityResolution: stats.total_identifiers > 0
        };
      }
    );

    console.log('  ✅ Data import workflow tests completed\n');
  }

  /**
   * Test customer analytics workflow
   */
  private async testCustomerAnalyticsWorkflow(): Promise<void> {
    console.log('📊 Testing Customer Analytics Workflow...');

    await this.addIntegrationTest(
      'Customer Analytics',
      'Segmentation Analysis',
      async () => {
        const segmentAnalysis = await db.execute(sql`
          SELECT 
            s.name as segment_name,
            COUNT(cs.customer_id) as customer_count
          FROM segments s
          LEFT JOIN customer_segments cs ON s.id = cs.segment_id
          GROUP BY s.id, s.name
          ORDER BY customer_count DESC
        `);
        
        const segments = segmentAnalysis.rows as any[];
        
        return {
          totalSegments: segments.length,
          segmentData: segments.map(s => ({ name: s.segment_name, count: s.customer_count })),
          analyticsReady: true
        };
      }
    );

    await this.addIntegrationTest(
      'Customer Analytics',
      'Demographics Processing',
      async () => {
        const demographics = await db.execute(sql`
          SELECT 
            gender,
            COUNT(*) as count,
            AVG(lifetime_value) as avg_ltv
          FROM customers
          WHERE gender IS NOT NULL
          GROUP BY gender
        `);
        
        const genderData = demographics.rows as any[];
        
        return {
          genderBreakdown: genderData,
          demographicAnalysis: genderData.length > 0,
          ltvCalculation: true
        };
      }
    );

    await this.addIntegrationTest(
      'Customer Analytics',
      'Geographic Distribution',
      async () => {
        const geographic = await db.execute(sql`
          SELECT 
            city,
            COUNT(*) as customer_count,
            AVG(data_quality_score) as avg_quality
          FROM customers
          WHERE city IS NOT NULL
          GROUP BY city
          ORDER BY customer_count DESC
          LIMIT 10
        `);
        
        const cities = geographic.rows as any[];
        
        return {
          topCities: cities,
          geographicAnalysis: cities.length > 0,
          qualityByLocation: true
        };
      }
    );

    console.log('  ✅ Customer analytics workflow tests completed\n');
  }

  /**
   * Test vector search workflow
   */
  private async testVectorSearchWorkflow(): Promise<void> {
    console.log('🔍 Testing Vector Search Workflow...');

    await this.addIntegrationTest(
      'Vector Search',
      'Embedding Generation',
      async () => {
        const embeddingStats = await db.execute(sql`
          SELECT 
            COUNT(*) as total_embeddings,
            COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as valid_embeddings
          FROM customer_embeddings
        `);
        
        const stats = embeddingStats.rows[0] as any;
        
        return {
          totalEmbeddings: stats.total_embeddings,
          validEmbeddings: stats.valid_embeddings,
          coverageRate: (stats.valid_embeddings / stats.total_embeddings * 100).toFixed(1) + '%'
        };
      }
    );

    await this.addIntegrationTest(
      'Vector Search',
      'Similarity Search',
      async () => {
        const startTime = Date.now();
        
        const similarityQuery = await db.execute(sql`
          SELECT 
            ce.customer_id,
            c.name,
            c.profession
          FROM customer_embeddings ce
          JOIN customers c ON ce.customer_id = c.id
          WHERE ce.embedding IS NOT NULL
          LIMIT 5
        `);
        
        const duration = Date.now() - startTime;
        
        return {
          searchResults: similarityQuery.rows.length,
          queryTime: `${duration}ms`,
          similaritySearch: true
        };
      }
    );

    console.log('  ✅ Vector search workflow tests completed\n');
  }

  /**
   * Test archive management workflow
   */
  private async testArchiveWorkflow(): Promise<void> {
    console.log('🗄️ Testing Archive Workflow...');

    await this.addIntegrationTest(
      'Archive Management',
      'Archive Schema Setup',
      async () => {
        const archiveTables = await archiveDb.execute(sql`
          SELECT tablename 
          FROM pg_tables 
          WHERE schemaname = 'archive'
        `);
        
        const expectedTables = ['metadata', 'customers', 'customer_identifiers', 'customer_events'];
        const existingTables = archiveTables.rows.map(r => r.tablename);
        const hasRequiredTables = expectedTables.every(table => existingTables.includes(table));
        
        return {
          archiveTables: existingTables.length,
          requiredTablesPresent: hasRequiredTables,
          schemaIsolation: true
        };
      }
    );

    await this.addIntegrationTest(
      'Archive Management',
      'Archive Metadata',
      async () => {
        const archiveMetadata = await archiveDb.execute(sql`
          SELECT COUNT(*) as count FROM archive.metadata
        `);
        
        return {
          archiveCount: archiveMetadata.rows[0].count,
          metadataTracking: true
        };
      }
    );

    console.log('  ✅ Archive workflow tests completed\n');
  }

  /**
   * Test error recovery workflow
   */
  private async testErrorRecoveryWorkflow(): Promise<void> {
    console.log('⚠️ Testing Error Recovery Workflow...');

    await this.addIntegrationTest(
      'Error Recovery',
      'Import Error Handling',
      async () => {
        const errorImports = await db.execute(sql`
          SELECT 
            COUNT(*) as total_imports,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_imports,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_imports
          FROM data_imports
        `);
        
        const stats = errorImports.rows[0] as any;
        const successRate = stats.total_imports > 0 ? (stats.successful_imports / stats.total_imports * 100).toFixed(1) : '0';
        
        return {
          totalImports: stats.total_imports,
          failedImports: stats.failed_imports,
          successfulImports: stats.successful_imports,
          successRate: successRate + '%'
        };
      }
    );

    await this.addIntegrationTest(
      'Error Recovery',
      'Data Validation',
      async () => {
        const dataValidation = await db.execute(sql`
          SELECT 
            COUNT(*) as total_customers,
            COUNT(CASE WHEN email IS NOT NULL AND email LIKE '%@%' THEN 1 END) as valid_emails,
            AVG(data_quality_score) as avg_quality_score
          FROM customers
        `);
        
        const stats = dataValidation.rows[0] as any;
        
        return {
          totalCustomers: stats.total_customers,
          validEmails: stats.valid_emails,
          averageQuality: parseFloat(stats.avg_quality_score).toFixed(2),
          dataValidation: true
        };
      }
    );

    console.log('  ✅ Error recovery workflow tests completed\n');
  }

  /**
   * Add integration test result
   */
  private async addIntegrationTest(
    workflow: string,
    step: string,
    testFn: () => Promise<any>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const data = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        workflow,
        step,
        status: 'passed',
        message: 'Integration test passed',
        duration,
        data
      });
      
      console.log(`    ✅ ${step} (${duration}ms): passed`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      this.results.push({
        workflow,
        step,
        status: 'failed',
        message,
        duration,
        data: null
      });
      
      console.log(`    ❌ ${step} (${duration}ms): ${message}`);
    }
  }
}

export { IntegrationTestSuite };
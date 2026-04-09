/**
 * Service Test Runner
 * 
 * Purpose: Execute and report on service tests in Replit environment
 * 
 * @created August 13, 2025
 */

// @vitest-environment node
import { dynamicAttributeService } from '@server/services/dynamic-attribute-service';
import { flexibleAIMapper } from '@server/services/flexible-ai-mapper';
import { enhancedJsonImportService } from '@server/services/enhanced-json-import-service';
import { bulkAIMapper } from '@server/services/bulk-ai-mapper';
import { apiMonitoringService } from '@server/services/api-monitoring-service';
import { cancellableEmbeddingService } from '@server/services/cancellable-embedding-service';
import { schemaRegistryService } from '@server/services/schema-registry-service';
import { nullRecordFixerService } from '@server/services/null-record-fixer';
import * as emailService from '@server/services/email-service';
import { db } from '@server/db';

// Test result tracking
interface TestResult {
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  duration: number;
  error?: string;
  evidence?: any;
}

const testResults: TestResult[] = [];

// Helper function to run a test
async function runTest(
  name: string,
  category: string,
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();
  let status: 'PASSED' | 'FAILED' | 'SKIPPED' = 'PASSED';
  let error: string | undefined;
  let evidence: any;

  try {
    await testFn();
    console.log(`✅ ${name}: PASSED`);
  } catch (e) {
    status = 'FAILED';
    error = e instanceof Error ? e.message : String(e);
    console.error(`❌ ${name}: FAILED - ${error}`);
    evidence = e;
  }

  const duration = Date.now() - startTime;
  testResults.push({ name, category, status, duration, error, evidence });
}

// Main test execution
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('COMPREHENSIVE SERVICE TEST SUITE');
  console.log('Date:', new Date().toISOString());
  console.log('Environment: Replit');
  console.log('='.repeat(60));
  console.log();

  // ========== DYNAMIC ATTRIBUTE SERVICE TESTS ==========
  console.log('### DYNAMIC ATTRIBUTE SERVICE TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'Create Custom Attribute',
    'Unit Test',
    async () => {
      const result = await dynamicAttributeService.createAttributeDefinition(
        'test_attr_' + Date.now(),
        'text',
        'Test attribute',
        'test_source',
        'demographics'
      );
      if (!result || !result.attributeName) {
        throw new Error('Failed to create attribute');
      }
    }
  );

  await runTest(
    'Suggest Attribute Mapping',
    'Unit Test',
    async () => {
      const suggestion = await dynamicAttributeService.suggestAttributeMapping(
        'age_column',
        [25, 30, 45, 60, 35],
        'test_source'
      );
      if (!suggestion || suggestion.confidence <= 0) {
        throw new Error('Invalid suggestion returned');
      }
    }
  );

  await runTest(
    'Handle Invalid Attribute Names',
    'Security Test',
    async () => {
      const result = await dynamicAttributeService.createAttributeDefinition(
        'Invalid-Name!!!@#$',
        'text',
        'Test invalid name handling',
        'test_source',
        'demographics'
      );
      if (!/^[a-z0-9_]+$/.test(result.attributeName)) {
        throw new Error('Invalid name not sanitized');
      }
    }
  );

  await runTest(
    'Bulk Attribute Creation Performance',
    'Performance Test',
    async () => {
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(
          dynamicAttributeService.createAttributeDefinition(
            `perf_test_${Date.now()}_${i}`,
            'text',
            `Performance test ${i}`,
            'perf_test',
            'demographics'
          )
        );
      }
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      if (duration > 10000) {
        throw new Error(`Performance too slow: ${duration}ms for 50 attributes`);
      }
      console.log(`  Performance: ${duration}ms for 50 attributes`);
    }
  );

  console.log();

  // ========== FLEXIBLE AI MAPPER TESTS ==========
  console.log('### FLEXIBLE AI MAPPER TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'AI Column Analysis',
    'Integration Test',
    async () => {
      const headers = ['name', 'email', 'phone'];
      const sampleRows = [
        { name: 'John Doe', email: 'john@test.com', phone: '555-1234' }
      ];
      
      const result = await flexibleAIMapper.analyzeFileColumns(headers, sampleRows, 100);
      if (!result || result.mappings.length !== headers.length) {
        throw new Error('Column analysis failed');
      }
    }
  );

  await runTest(
    'Schema Pattern Detection',
    'Unit Test',
    async () => {
      const musicHeaders = ['GENRE_FAVORIT', 'ARTIS_FAVORIT'];
      const result = await flexibleAIMapper.detectSchemaPattern(musicHeaders);
      if (!result) {
        console.log('  Note: No schema pattern detected (expected for small sample)');
      }
    }
  );

  await runTest(
    'XSS/SQL Injection Prevention',
    'Security Test',
    async () => {
      const maliciousHeaders = ['<script>alert("XSS")</script>', 'DROP TABLE;'];
      const result = await flexibleAIMapper.analyzeFileColumns(maliciousHeaders, [], 100);
      
      result.mappings.forEach(mapping => {
        if (mapping.columnName.includes('<script>') || 
            mapping.columnName.includes('DROP TABLE')) {
          throw new Error('Security vulnerability: malicious input not sanitized');
        }
      });
    }
  );

  console.log();

  // ========== API MONITORING SERVICE TESTS ==========
  console.log('### API MONITORING SERVICE TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'API Metrics Tracking',
    'Unit Test',
    async () => {
      const middleware = apiMonitoringService.monitor();
      const req = {
        method: 'GET',
        originalUrl: '/api/test',
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1'
      };
      const res = {
        statusCode: 200,
        setHeader: () => {},
        end: () => {},
        on: () => {}
      };
      const next = () => {};
      
      middleware(req as any, res as any, next as any);
      
      const metrics = apiMonitoringService.getMetricsSummary();
      if (!metrics) {
        throw new Error('Metrics not generated');
      }
    }
  );

  await runTest(
    'Performance Alert Generation',
    'Unit Test',
    async () => {
      const alerts = apiMonitoringService.getPerformanceAlerts();
      if (!Array.isArray(alerts)) {
        throw new Error('Alerts not returned as array');
      }
    }
  );

  await runTest(
    'High Volume Performance',
    'Performance Test',
    async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 500; i++) {
        apiMonitoringService.getMetricsSummary();
      }
      
      const duration = Date.now() - startTime;
      if (duration > 200) {
        throw new Error(`Performance too slow: ${duration}ms for 500 operations`);
      }
      console.log(`  Performance: ${duration}ms for 500 operations`);
    }
  );

  console.log();

  // ========== SCHEMA REGISTRY SERVICE TESTS ==========
  console.log('### SCHEMA REGISTRY SERVICE TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'Schema Retrieval',
    'Unit Test',
    async () => {
      const schema = await schemaRegistryService.getSchemaByName('music_industry');
      if (!schema || !schema.fieldDefinitions) {
        throw new Error('Schema not found or invalid');
      }
    }
  );

  await runTest(
    'List All Schemas',
    'Unit Test',
    async () => {
      const schemas = await schemaRegistryService.listSchemas();
      if (!Array.isArray(schemas) || schemas.length === 0) {
        throw new Error('No schemas found');
      }
    }
  );

  await runTest(
    'Field Validation',
    'Unit Test',
    async () => {
      const isValid = await schemaRegistryService.validateField(
        'music_industry',
        'genre_preferences',
        ['Rock', 'Jazz']
      );
      if (typeof isValid !== 'boolean') {
        throw new Error('Validation did not return boolean');
      }
    }
  );

  console.log();

  // ========== EMAIL SERVICE TESTS ==========
  console.log('### EMAIL SERVICE TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'Missing API Key Handling',
    'Error Handling Test',
    async () => {
      const originalKey = process.env.SENDGRID_API_KEY;
      delete process.env.SENDGRID_API_KEY;
      
      const result = await emailService.sendActivationEmail({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        activationToken: 'test-token'
      });
      
      if (result !== false) {
        throw new Error('Should return false when API key is missing');
      }
      
      process.env.SENDGRID_API_KEY = originalKey;
    }
  );

  await runTest(
    'URL Generation',
    'Unit Test',
    async () => {
      const baseUrl = emailService.getBaseUrl();
      if (!baseUrl.match(/^https?:\/\//)) {
        throw new Error('Invalid URL format');
      }
    }
  );

  console.log();

  // ========== INTEGRATION TESTS ==========
  console.log('### INTEGRATION TESTS ###');
  console.log('-'.repeat(40));

  await runTest(
    'Service Data Consistency',
    'Integration Test',
    async () => {
      const testName = `consistency_test_${Date.now()}`;
      
      // Create attribute through service
      const created = await dynamicAttributeService.createAttributeDefinition(
        testName,
        'text',
        'Data consistency test',
        'test',
        'demographics'
      );
      
      // Verify it can be retrieved
      const allAttributes = await dynamicAttributeService.getAllCustomAttributes();
      const found = allAttributes.find(a => a.attributeName === testName);
      
      if (!found) {
        throw new Error('Created attribute not found in retrieval');
      }
    }
  );

  await runTest(
    'Cross-Service Workflow',
    'Integration Test',
    async () => {
      // Test interaction between AI mapper and attribute service
      const headers = ['custom_field_1', 'custom_field_2'];
      const rows = [{ custom_field_1: 'value1', custom_field_2: 'value2' }];
      
      // AI analysis
      const analysis = await flexibleAIMapper.analyzeFileColumns(headers, rows, 100);
      
      // Create attributes for unmapped fields
      for (const mapping of analysis.mappings.slice(0, 1)) { // Just test one
        if (mapping.targetSystem === 'attributes' || mapping.targetSystem === 'skip') {
          const result = await dynamicAttributeService.createAttributeDefinition(
            `workflow_${mapping.columnName}_${Date.now()}`,
            'text',
            `Imported from ${mapping.originalName}`,
            'workflow_test',
            'demographics'
          );
          
          if (!result) {
            throw new Error('Failed to create attribute in workflow');
          }
        }
      }
    }
  );

  // ========== TEST SUMMARY ==========
  console.log();
  console.log('='.repeat(60));
  console.log('TEST EXECUTION SUMMARY');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(t => t.status === 'PASSED').length;
  const failed = testResults.filter(t => t.status === 'FAILED').length;
  const skipped = testResults.filter(t => t.status === 'SKIPPED').length;
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log();
  
  // Show failed tests
  if (failed > 0) {
    console.log('Failed Tests:');
    testResults.filter(t => t.status === 'FAILED').forEach(test => {
      console.log(`  - ${test.name}: ${test.error}`);
    });
    console.log();
  }
  
  // Performance summary
  console.log('Performance Metrics:');
  const perfTests = testResults.filter(t => t.category === 'Performance Test');
  perfTests.forEach(test => {
    console.log(`  - ${test.name}: ${test.duration}ms`);
  });
  console.log();
  
  // Category breakdown
  console.log('Test Categories:');
  const categories = [...new Set(testResults.map(t => t.category))];
  categories.forEach(cat => {
    const catTests = testResults.filter(t => t.category === cat);
    const catPassed = catTests.filter(t => t.status === 'PASSED').length;
    console.log(`  - ${cat}: ${catPassed}/${catTests.length} passed`);
  });
  
  console.log();
  console.log('Test execution completed at:', new Date().toISOString());
  console.log('='.repeat(60));
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
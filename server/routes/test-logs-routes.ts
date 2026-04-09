/**
 * Test routes for comprehensive logging system validation
 * Development and testing use only
 */

import { Router } from 'express';
import { applicationLogger } from '../services/application-logger';

const router = Router();

/**
 * Create comprehensive test logs for validation
 */
router.post('/api/test/logs/comprehensive', async (req, res) => {
  try {

    // Test 1: Basic logging levels
    await applicationLogger.debug('system', 'Debug level test message', { test: 'debug_validation' });
    await applicationLogger.info('system', 'Info level test message', { test: 'info_validation' });
    await applicationLogger.warn('system', 'Warning level test message', { test: 'warn_validation' });

    // Test 2: Error logging with stack trace
    const testError = new Error('Test error for logging validation');
    await applicationLogger.error('system', 'Error level test message', testError, { test: 'error_validation' });
    await applicationLogger.error('system', 'Critical level test message', testError, { test: 'critical_validation' });

    // Test 3: Category-specific logs
    await applicationLogger.logEmail('sent', 'test@example.com', { template: 'activation' });
    await applicationLogger.logAuth('login', undefined, { email: 'test@example.com', ip: '127.0.0.1' });
    await applicationLogger.logDatabase('SELECT', 'customers', { duration: '25ms' });
    await applicationLogger.logAPI('POST', '/api/test', 200, 150, { userId: 'test123' });
    await applicationLogger.logImport('Import processing started', undefined, { filename: 'test.xlsx', records: 100, status: 'processing' });
    await applicationLogger.logVector('Vector similarity search', { operation: 'similarity_search', query: 'test query', results: 5 });
    await applicationLogger.info('security', 'Test security event', { event: 'suspicious_activity', ip: '192.168.1.1' });

    // Test 4: User-specific logs with session context
    const userId = req.user?.id || null;
    await applicationLogger.info('system', 'User-specific test log', {
      test: 'user_association',
      hasUser: !!req.user,
      userId: userId
    });

    // Test 5: Complex metadata
    await applicationLogger.info('system', 'Complex metadata test', {
      nested: {
        data: {
          level1: 'test',
          level2: {
            numbers: [1, 2, 3],
            boolean: true,
            timestamp: new Date().toISOString()
          }
        }
      },
      array: ['item1', 'item2', 'item3'],
      metrics: {
        duration: 150,
        memory_usage: '45MB',
        cpu_usage: '12%'
      }
    });


    res.json({
      success: true,
      message: 'Comprehensive test logs created successfully',
      logs_created: 15,
      categories_tested: ['system', 'email', 'authentication', 'database', 'api', 'import', 'vector', 'security'],
      levels_tested: ['debug', 'info', 'warn', 'error', 'critical']
    });

  } catch (error) {
    applicationLogger.error('api', '❌ Failed to create test logs:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    await applicationLogger.error('system', 'Failed to create comprehensive test logs', error as Error, {
      test: 'test_creation_error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create test logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Simulate real application events for testing
 */
router.post('/api/test/logs/simulate-events', async (req, res) => {
  try {

    // Simulate user registration flow
    await applicationLogger.info('authentication', 'New user registration initiated', {
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      registration_source: 'web_form'
    });

    // Simulate email sending
    await applicationLogger.info('email', 'Activation email queued', {
      to: 'testuser@example.com',
      template: 'activation',
      priority: 'high'
    });

    // Simulate successful email delivery
    await applicationLogger.info('email', 'Activation email delivered successfully', {
      to: 'testuser@example.com',
      messageId: 'msg_' + Date.now(),
      delivery_time: '1.2s'
    });

    // Simulate data import process
    await applicationLogger.info('import', 'Data import process started', {
      filename: 'customer_data_2025.xlsx',
      fileSize: '2.4MB',
      estimated_records: 5000
    });

    await applicationLogger.info('import', 'Data validation completed', {
      total_records: 5000,
      valid_records: 4850,
      invalid_records: 150,
      validation_time: '15s'
    });

    await applicationLogger.warn('import', 'Import completed with warnings', {
      processed_records: 4850,
      skipped_records: 150,
      warnings: ['Missing phone numbers', 'Invalid email formats'],
      import_id: 'imp_' + Date.now()
    });

    // Simulate vector search operations
    await applicationLogger.info('vector', 'Vector embeddings generation started', {
      total_customers: 4850,
      batch_size: 100,
      estimated_time: '8 minutes'
    });

    await applicationLogger.info('vector', 'Vector search query executed', {
      query: 'professional musicians in Jakarta',
      results_found: 23,
      search_time: '145ms',
      similarity_threshold: 0.85
    });

    // Simulate security events
    await applicationLogger.warn('security', 'Multiple login attempts detected', {
      ip_address: '203.142.15.87',
      email: 'admin@example.com',
      attempts: 5,
      time_window: '10 minutes',
      blocked: false
    });

    await applicationLogger.error('security', 'Suspicious API access pattern', new Error('Rate limit exceeded'), {
      ip_address: '198.51.100.42',
      endpoint: '/api/customers/export',
      requests_per_minute: 150,
      normal_threshold: 10,
      action: 'temporary_block'
    });


    res.json({
      success: true,
      message: 'Real application events simulated successfully',
      events_simulated: [
        'user_registration',
        'email_delivery',
        'data_import_flow',
        'vector_operations',
        'security_incidents'
      ],
      total_logs: 11
    });

  } catch (error) {
    applicationLogger.error('api', '❌ Failed to simulate events:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
    res.status(500).json({
      success: false,
      error: 'Failed to simulate events',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

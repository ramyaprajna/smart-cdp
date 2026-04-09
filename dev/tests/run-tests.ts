#!/usr/bin/env tsx
/**
 * Test Runner Script
 * 
 * Runs comprehensive tests for the flexible CDP data import features
 * Usage: npm run test:import
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface TestSuite {
  name: string;
  pattern: string;
  description: string;
}

const testSuites: TestSuite[] = [
  {
    name: 'Unit Tests - Schema Registry',
    pattern: 'tests/unit/flexible-cdp/schema-registry.test.ts',
    description: 'Tests schema management and industry detection',
  },
  {
    name: 'Unit Tests - Flexible AI Mapper',
    pattern: 'tests/unit/flexible-cdp/flexible-ai-mapper.test.ts',
    description: 'Tests AI-powered column mapping with custom attributes',
  },
  {
    name: 'Unit Tests - Dynamic Attribute Service',
    pattern: 'tests/unit/flexible-cdp/dynamic-attribute-service.test.ts',
    description: 'Tests on-the-fly custom attribute creation',
  },
  {
    name: 'Unit Tests - Enhanced Import Service',
    pattern: 'tests/unit/flexible-cdp/enhanced-import-service.test.ts',
    description: 'Tests complete import workflow with custom attributes',
  },
  {
    name: 'Integration Tests - API Endpoints',
    pattern: 'tests/integration/flexible-cdp-endpoints.test.ts',
    description: 'Tests all flexible CDP REST API endpoints',
  },
  {
    name: 'E2E Tests - Complete Workflow',
    pattern: 'tests/e2e/flexible-cdp-workflow.test.ts',
    description: 'Tests end-to-end import workflow with real scenarios',
  },
];

async function runTestSuite(suite: TestSuite): Promise<boolean> {
  console.log(chalk.blue(`\n🧪 Running: ${suite.name}`));
  console.log(chalk.gray(`   ${suite.description}`));
  console.log(chalk.gray(`   Pattern: ${suite.pattern}\n`));

  try {
    const { stdout, stderr } = await execAsync(
      `npx vitest run ${suite.pattern} --reporter=verbose`
    );

    if (stdout) {
      console.log(stdout);
    }

    if (stderr && !stderr.includes('ExperimentalWarning')) {
      console.error(chalk.red(stderr));
    }

    console.log(chalk.green(`✅ ${suite.name} passed\n`));
    return true;
  } catch (error: any) {
    console.error(chalk.red(`❌ ${suite.name} failed\n`));
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(chalk.red(error.stderr));
    }
    return false;
  }
}

async function runAllTests() {
  console.log(chalk.bold.cyan('\n🚀 Running Flexible CDP Import Tests\n'));
  console.log(chalk.gray('This will test all data import features including:'));
  console.log(chalk.gray('- AI-powered column mapping'));
  console.log(chalk.gray('- Schema registry and industry detection'));
  console.log(chalk.gray('- Dynamic custom attribute creation'));
  console.log(chalk.gray('- Enhanced import workflow'));
  console.log(chalk.gray('- API endpoints and error handling\n'));

  const startTime = Date.now();
  const results: boolean[] = [];

  for (const suite of testSuites) {
    const passed = await runTestSuite(suite);
    results.push(passed);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  const totalTests = testSuites.length;
  const passedTests = results.filter(r => r).length;
  const failedTests = totalTests - passedTests;

  console.log(chalk.bold('\n📊 Test Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Total Test Suites: ${totalTests}`);
  console.log(chalk.green(`Passed: ${passedTests}`));
  console.log(failedTests > 0 ? chalk.red(`Failed: ${failedTests}`) : chalk.gray(`Failed: 0`));
  console.log(`Duration: ${duration}s`);
  console.log(chalk.gray('─'.repeat(50)));

  if (failedTests === 0) {
    console.log(chalk.bold.green('\n✅ All tests passed! The flexible CDP import system is working correctly.\n'));
  } else {
    console.log(chalk.bold.red(`\n❌ ${failedTests} test suite(s) failed. Please check the errors above.\n`));
    process.exit(1);
  }
}

// Run coverage report
async function runCoverageReport() {
  console.log(chalk.blue('\n📈 Generating coverage report...\n'));
  
  try {
    const { stdout } = await execAsync(
      'npx vitest run tests/unit/flexible-cdp/*.test.ts tests/integration/flexible-cdp*.test.ts --coverage'
    );
    
    console.log(stdout);
    console.log(chalk.green('✅ Coverage report generated\n'));
  } catch (error: any) {
    console.error(chalk.red('❌ Failed to generate coverage report'));
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--coverage')) {
    await runCoverageReport();
  } else {
    await runAllTests();
  }
}

main().catch(error => {
  console.error(chalk.red('\n💥 Test runner failed:'), error);
  process.exit(1);
});
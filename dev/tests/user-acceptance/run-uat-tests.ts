/**
 * User Acceptance Test Runner
 * 
 * Comprehensive test suite runner for validating React component
 * refactoring changes and performance optimizations.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TestResults {
  suite: string;
  passed: boolean;
  duration: number;
  details: string;
  coverage?: number;
}

class UATTestRunner {
  private results: TestResults[] = [];

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting User Acceptance Tests for React Component Refactoring');
    console.log('=' .repeat(80));

    try {
      // Run main UAT suite
      await this.runTestSuite(
        'React Component Refactoring Tests',
        'npx vitest run tests/user-acceptance/react-component-refactoring.test.tsx --reporter=verbose'
      );

      // Run integration tests
      await this.runTestSuite(
        'Component Integration Tests', 
        'npx vitest run tests/user-acceptance/component-integration.test.tsx --reporter=verbose'
      );

      // Run performance validation
      await this.runTestSuite(
        'Performance Validation Tests',
        'npx vitest run tests/user-acceptance/performance-validation.test.tsx --reporter=verbose'
      );

      // Run existing component tests to ensure no regressions
      await this.runTestSuite(
        'Regression Tests',
        'npx vitest run tests/components/ --reporter=verbose'
      );

      // Generate summary report
      this.generateSummaryReport();

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  private async runTestSuite(suiteName: string, command: string): Promise<void> {
    console.log(`\n📋 Running: ${suiteName}`);
    console.log('-'.repeat(50));

    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command);
      const duration = Date.now() - startTime;

      console.log(stdout);
      if (stderr) {
        console.warn('Warnings:', stderr);
      }

      this.results.push({
        suite: suiteName,
        passed: true,
        duration,
        details: this.extractTestDetails(stdout),
        coverage: this.extractCoverage(stdout)
      });

      console.log(`✅ ${suiteName} completed in ${duration}ms`);

    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.results.push({
        suite: suiteName,
        passed: false,
        duration,
        details: error.stdout || error.message
      });

      console.log(`❌ ${suiteName} failed in ${duration}ms`);
      console.log('Error details:', error.stdout || error.message);
    }
  }

  private extractTestDetails(output: string): string {
    // Extract test count and pass/fail information
    const testMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    
    let details = '';
    if (testMatch) details += `${testMatch[1]} passed`;
    if (failMatch) details += `, ${failMatch[1]} failed`;
    
    return details || 'Details not available';
  }

  private extractCoverage(output: string): number | undefined {
    // Extract coverage percentage if available
    const coverageMatch = output.match(/All files\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)/);
    return coverageMatch ? parseFloat(coverageMatch[1]) : undefined;
  }

  private generateSummaryReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 USER ACCEPTANCE TEST SUMMARY REPORT');
    console.log('='.repeat(80));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📈 Overall Results:`);
    console.log(`   Total Test Suites: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${totalTests - passedTests}`);
    console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`   Total Duration: ${totalDuration}ms`);

    console.log(`\n📋 Detailed Results:`);
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      const coverage = result.coverage ? ` (${result.coverage}% coverage)` : '';
      
      console.log(`   ${index + 1}. ${status} ${result.suite}`);
      console.log(`      Duration: ${result.duration}ms${coverage}`);
      console.log(`      Details: ${result.details}`);
    });

    // Performance benchmarks
    console.log(`\n⚡ Performance Benchmarks:`);
    console.log(`   Average test suite duration: ${(totalDuration / totalTests).toFixed(0)}ms`);
    
    const performanceResult = this.results.find(r => r.suite.includes('Performance'));
    if (performanceResult) {
      console.log(`   Performance validation: ${performanceResult.passed ? 'PASSED' : 'FAILED'}`);
    }

    // Coverage analysis
    const coverageResults = this.results.filter(r => r.coverage !== undefined);
    if (coverageResults.length > 0) {
      const avgCoverage = coverageResults.reduce((sum, r) => sum + (r.coverage || 0), 0) / coverageResults.length;
      console.log(`   Average test coverage: ${avgCoverage.toFixed(1)}%`);
    }

    // Validation checklist
    console.log(`\n✅ Validation Checklist:`);
    console.log(`   🔍 Component rendering: ${this.checkValidation('Component Refactoring')}`);
    console.log(`   🎯 User interactions: ${this.checkValidation('Component Integration')}`);
    console.log(`   ⚡ Performance optimization: ${this.checkValidation('Performance Validation')}`);
    console.log(`   🛡️  Regression prevention: ${this.checkValidation('Regression Tests')}`);

    // Recommendations
    console.log(`\n💡 Recommendations:`);
    if (passedTests === totalTests) {
      console.log(`   ✨ All tests passed! The React component refactoring is ready for production.`);
      console.log(`   🚀 Performance optimizations are working correctly.`);
      console.log(`   🔒 No regressions detected in existing functionality.`);
    } else {
      console.log(`   ⚠️  Some tests failed. Review the failed test details above.`);
      console.log(`   🔧 Address any performance or functionality issues before deployment.`);
    }

    console.log('\n' + '='.repeat(80));
  }

  private checkValidation(testType: string): string {
    const result = this.results.find(r => r.suite.includes(testType));
    return result ? (result.passed ? 'PASSED' : 'FAILED') : 'NOT RUN';
  }
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new UATTestRunner();
  runner.runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { UATTestRunner };
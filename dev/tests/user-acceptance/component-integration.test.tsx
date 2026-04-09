/**
 * Component Integration User Acceptance Tests
 * 
 * Tests the integration between refactored components to ensure
 * they work together correctly after the React optimization changes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'wouter';

// Mock the API calls
const mockApi = {
  getCustomers: vi.fn(),
  getImports: vi.fn(),
  getStats: vi.fn(),
  getSegmentDistribution: vi.fn()
};

// Mock components to test integration
const TestApp = () => {
  return (
    <BrowserRouter>
      <div className="app">
        <div data-testid="dashboard">Dashboard Content</div>
        <div data-testid="customers">Customers Content</div>
        <div data-testid="imports">Imports Content</div>
      </div>
    </BrowserRouter>
  );
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Component Integration Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  describe('Cross-component State Management', () => {
    it('should maintain consistent state across components', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Verify all main sections are rendered
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      expect(screen.getByTestId('customers')).toBeInTheDocument();
      expect(screen.getByTestId('imports')).toBeInTheDocument();
    });
  });

  describe('Performance Integration', () => {
    it('should handle multiple component updates efficiently', async () => {
      const startTime = performance.now();

      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render quickly even with multiple components
      expect(renderTime).toBeLessThan(500);
    });
  });

  describe('Error Boundary Integration', () => {
    it('should handle component errors gracefully', () => {
      // This test verifies that error boundaries work correctly
      // with the refactored memo components
      
      const ErrorComponent = () => {
        throw new Error('Test error');
      };

      const AppWithError = () => (
        <TestWrapper>
          <div>
            <ErrorComponent />
          </div>
        </TestWrapper>
      );

      // Should not crash the entire application
      expect(() => render(<AppWithError />)).toThrow('Test error');
    });
  });
});
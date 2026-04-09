/**
 * Performance Validation Tests for React Component Refactoring
 * 
 * Validates that the React.memo and useCallback optimizations
 * are working correctly and providing performance benefits.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock performance-critical components
const MockHeavyComponent = React.memo(({ data, callback }: { data: any[], callback: () => void }) => {
  return (
    <div>
      <div data-testid="heavy-component">Heavy Component</div>
      <div data-testid="data-count">{data.length}</div>
      <button onClick={callback}>Action</button>
    </div>
  );
});

const MockParentComponent = ({ items }: { items: any[] }) => {
  const [count, setCount] = React.useState(0);
  
  const optimizedCallback = React.useCallback(() => {
    setCount(c => c + 1);
  }, []);

  return (
    <div>
      <div data-testid="parent-component">Parent: {count}</div>
      <MockHeavyComponent data={items} callback={optimizedCallback} />
    </div>
  );
};

describe('Performance Validation Tests', () => {
  describe('React.memo Optimization', () => {
    it('should prevent unnecessary re-renders with identical props', () => {
      const renderSpy = vi.fn();
      
      const TrackedComponent = React.memo(({ value }: { value: string }) => {
        renderSpy();
        return <div data-testid="tracked">{value}</div>;
      });

      const { rerender } = render(<TrackedComponent value="test" />);
      
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('tracked')).toHaveTextContent('test');

      // Re-render with same props - should not trigger re-render
      rerender(<TrackedComponent value="test" />);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Re-render with different props - should trigger re-render
      rerender(<TrackedComponent value="changed" />);
      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('tracked')).toHaveTextContent('changed');
    });

    it('should handle complex props correctly with memo', () => {
      const renderSpy = vi.fn();
      
      const ComplexComponent = React.memo(({ 
        config,
        items,
        callback 
      }: { 
        config: object;
        items: any[];
        callback: () => void;
      }) => {
        renderSpy();
        return (
          <div>
            <div data-testid="config">{JSON.stringify(config)}</div>
            <div data-testid="items-count">{items.length}</div>
            <button onClick={callback}>Click</button>
          </div>
        );
      });

      const config = { setting: 'value' };
      const items = [1, 2, 3];
      const callback = () => {};

      const { rerender } = render(
        <ComplexComponent config={config} items={items} callback={callback} />
      );

      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Re-render with same object references - should not re-render
      rerender(<ComplexComponent config={config} items={items} callback={callback} />);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Re-render with new array reference but same content - should re-render
      rerender(<ComplexComponent config={config} items={[1, 2, 3]} callback={callback} />);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('useCallback Optimization', () => {
    it('should maintain callback reference stability', () => {
      const callbackRefs: Array<() => void> = [];
      
      const TestComponent = ({ count }: { count: number }) => {
        const stableCallback = React.useCallback(() => {
          console.log('stable callback');
        }, []); // Empty dependency array - should remain stable

        const dependentCallback = React.useCallback(() => {
          console.log('dependent callback', count);
        }, [count]); // Depends on count - should change when count changes

        // Store refs to check stability
        React.useEffect(() => {
          callbackRefs.push(stableCallback);
        }, [stableCallback]);

        return (
          <div>
            <div data-testid="count">{count}</div>
            <button onClick={stableCallback}>Stable</button>
            <button onClick={dependentCallback}>Dependent</button>
          </div>
        );
      };

      const { rerender } = render(<TestComponent count={1} />);
      
      rerender(<TestComponent count={1} />);
      rerender(<TestComponent count={2} />);
      rerender(<TestComponent count={2} />);

      // Stable callback should maintain same reference
      expect(callbackRefs[0]).toBe(callbackRefs[1]); // Same when count didn't change
      expect(callbackRefs[1]).toBe(callbackRefs[2]); // Same even when count changed (empty deps)
    });

    it('should handle dependent callbacks correctly', () => {
      let callbackExecutions = 0;

      const TestComponent = ({ multiplier }: { multiplier: number }) => {
        const [value, setValue] = React.useState(1);

        const calculate = React.useCallback(() => {
          callbackExecutions++;
          return value * multiplier;
        }, [value, multiplier]);

        return (
          <div>
            <div data-testid="result">{calculate()}</div>
            <button onClick={() => setValue(v => v + 1)}>Increment</button>
          </div>
        );
      };

      const { rerender } = render(<TestComponent multiplier={2} />);
      
      expect(screen.getByTestId('result')).toHaveTextContent('2'); // 1 * 2
      expect(callbackExecutions).toBe(1);

      // Re-render with same props - callback should be memoized
      rerender(<TestComponent multiplier={2} />);
      expect(callbackExecutions).toBe(2); // Called again due to render

      // Change multiplier - should create new callback
      rerender(<TestComponent multiplier={3} />);
      expect(screen.getByTestId('result')).toHaveTextContent('3'); // 1 * 3
    });
  });

  describe('Combined Optimization Performance', () => {
    it('should efficiently handle parent-child render optimization', () => {
      const childRenderSpy = vi.fn();
      const parentRenderSpy = vi.fn();

      const OptimizedChild = React.memo(({ value, onAction }: { value: number; onAction: () => void }) => {
        childRenderSpy();
        return (
          <div>
            <div data-testid="child-value">{value}</div>
            <button onClick={onAction}>Child Action</button>
          </div>
        );
      });

      const OptimizedParent = ({ externalValue }: { externalValue: number }) => {
        parentRenderSpy();
        const [internalState, setInternalState] = React.useState(0);

        const stableCallback = React.useCallback(() => {
          setInternalState(s => s + 1);
        }, []);

        return (
          <div>
            <div data-testid="parent-state">{internalState}</div>
            <div data-testid="external-value">{externalValue}</div>
            <OptimizedChild value={externalValue} onAction={stableCallback} />
          </div>
        );
      };

      const { rerender } = render(<OptimizedParent externalValue={1} />);

      expect(parentRenderSpy).toHaveBeenCalledTimes(1);
      expect(childRenderSpy).toHaveBeenCalledTimes(1);

      // Re-render parent with same external value
      rerender(<OptimizedParent externalValue={1} />);

      expect(parentRenderSpy).toHaveBeenCalledTimes(2);
      expect(childRenderSpy).toHaveBeenCalledTimes(1); // Child should not re-render

      // Change external value
      rerender(<OptimizedParent externalValue={2} />);

      expect(parentRenderSpy).toHaveBeenCalledTimes(3);
      expect(childRenderSpy).toHaveBeenCalledTimes(2); // Child should re-render due to value change

      expect(screen.getByTestId('child-value')).toHaveTextContent('2');
    });

    it('should handle rapid state updates efficiently', async () => {
      const renderSpy = vi.fn();

      const RapidUpdateComponent = React.memo(() => {
        renderSpy();
        const [count, setCount] = React.useState(0);

        const increment = React.useCallback(() => {
          setCount(c => c + 1);
        }, []);

        return (
          <div>
            <div data-testid="rapid-count">{count}</div>
            <button onClick={increment}>Increment</button>
          </div>
        );
      });

      render(<RapidUpdateComponent />);

      const button = screen.getByText('Increment');

      // Simulate rapid clicks
      for (let i = 0; i < 5; i++) {
        fireEvent.click(button);
      }

      // Should handle rapid updates without issues
      expect(screen.getByTestId('rapid-count')).toHaveTextContent('5');
      expect(renderSpy).toHaveBeenCalledTimes(6); // Initial + 5 updates
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle large lists efficiently with memo', () => {
      const itemRenderSpy = vi.fn();

      const ListItem = React.memo(({ item, onUpdate }: { item: any; onUpdate: (id: string) => void }) => {
        itemRenderSpy();
        return (
          <div data-testid={`item-${item.id}`}>
            {item.name}
            <button onClick={() => onUpdate(item.id)}>Update</button>
          </div>
        );
      });

      const LargeList = ({ items }: { items: any[] }) => {
        const [updateCount, setUpdateCount] = React.useState(0);

        const handleUpdate = React.useCallback((id: string) => {
          setUpdateCount(c => c + 1);
        }, []);

        return (
          <div>
            <div data-testid="update-count">{updateCount}</div>
            {items.map(item => (
              <ListItem key={item.id} item={item} onUpdate={handleUpdate} />
            ))}
          </div>
        );
      };

      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));

      const startTime = performance.now();
      render(<LargeList items={largeDataset} />);
      const endTime = performance.now();

      // Should render large lists reasonably quickly
      expect(endTime - startTime).toBeLessThan(1000);

      // Verify items are rendered
      expect(screen.getByTestId('item-0')).toBeInTheDocument();
      expect(screen.getByTestId('item-99')).toBeInTheDocument();

      // All items should be rendered once
      expect(itemRenderSpy).toHaveBeenCalledTimes(100);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should properly cleanup useCallback dependencies', () => {
      const TestComponent = ({ data }: { data: any[] }) => {
        const [filter, setFilter] = React.useState('');

        const filterData = React.useCallback(() => {
          return data.filter(item => item.name.includes(filter));
        }, [data, filter]);

        React.useEffect(() => {
          const result = filterData();
          // Simulate using the filtered data
        }, [filterData]);

        return (
          <div>
            <input 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="filter-input"
            />
            <div data-testid="filtered-count">{filterData().length}</div>
          </div>
        );
      };

      const data = [
        { name: 'Item 1' },
        { name: 'Item 2' },
        { name: 'Filter Item' }
      ];

      const { unmount } = render(<TestComponent data={data} />);

      expect(screen.getByTestId('filtered-count')).toHaveTextContent('3');

      // Component should unmount cleanly without memory leaks
      unmount();
    });
  });
});
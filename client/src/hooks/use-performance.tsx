import { useEffect, useRef, useState } from 'react';

// Performance monitoring hook for customer data operations
export function usePerformanceMonitor(operation: string) {
  const startTime = useRef<number>(Date.now());
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    memoryUsage: 0,
    renderCount: 0
  });

  useEffect(() => {
    const endTime = Date.now();
    const loadTime = endTime - startTime.current;

    // Get memory usage if available
    const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;

    setMetrics(prev => ({
      loadTime,
      memoryUsage: Math.round(memoryUsage / 1024 / 1024), // MB
      renderCount: prev.renderCount + 1
    }));

    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${operation}:`, {
        loadTime: `${loadTime}ms`,
        memoryUsage: `${Math.round(memoryUsage / 1024 / 1024)}MB`,
        renderCount: metrics.renderCount + 1
      });
    }
  }, [operation]);

  return metrics;
}

// Debounced search hook for vector search optimization
export function useDebounceSearch<T>(
  searchFunction: (query: string) => Promise<T[]>,
  delay: number = 500
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      const searchResults = await searchFunction(searchQuery);
      setResults(searchResults);
    } catch (error) {
      if (!abortControllerRef.current.signal.aborted) {
        console.error('Search error:', error);
        setResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const debouncedSearch = (searchQuery: string) => {
    setQuery(searchQuery);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    query,
    results,
    isLoading,
    search: debouncedSearch
  };
}

// Virtual scrolling hook for large customer lists
export function useVirtualScroll(
  items: any[],
  containerHeight: number,
  itemHeight: number
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);

  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const totalHeight = items.length * itemHeight;

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount + 1, items.length);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return {
    containerRef: setContainerRef,
    visibleItems,
    totalHeight,
    offsetY,
    onScroll
  };
}

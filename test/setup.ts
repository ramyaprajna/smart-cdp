import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock lucide-react icons to avoid import errors in tests
vi.mock('lucide-react', () => {
  // Create a generic icon component mock that returns null (simplest approach)
  const MockIcon = () => null;
  
  return {
    // Add all icons used in the codebase as the same mock component
    X: MockIcon,
    Check: MockIcon,
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    ChevronLeft: MockIcon,
    ChevronRight: MockIcon,
    ChevronsUpDown: MockIcon,
    Circle: MockIcon,
    Plus: MockIcon,
    Minus: MockIcon,
    Search: MockIcon,
    Calendar: MockIcon,
    CalendarIcon: MockIcon,
    Menu: MockIcon,
    Settings: MockIcon,
    User: MockIcon,
    LogOut: MockIcon,
    Upload: MockIcon,
    Download: MockIcon,
    Trash: MockIcon,
    Trash2: MockIcon,
    Edit: MockIcon,
    Eye: MockIcon,
    EyeOff: MockIcon,
    AlertCircle: MockIcon,
    AlertTriangle: MockIcon,
    Info: MockIcon,
    HelpCircle: MockIcon,
    Loader2: MockIcon,
    MoreVertical: MockIcon,
    MoreHorizontal: MockIcon,
    Brain: MockIcon,
    Users: MockIcon,
    TrendingUp: MockIcon,
    CheckCircle: MockIcon,
    Lightbulb: MockIcon,
    Target: MockIcon,
    Zap: MockIcon,
    Archive: MockIcon,
    Database: MockIcon,
    RefreshCw: MockIcon,
    Clock: MockIcon,
    BarChart3: MockIcon,
  };
});

// Polyfill for ResizeObserver (used by Radix UI components)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill for IntersectionObserver (used by some UI components)
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as any;

afterEach(() => {
  cleanup();
});

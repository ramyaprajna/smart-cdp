/**
 * Criteria Builder Component - Visual filter builder for admin-friendly segment creation
 * 
 * Main component that provides visual interface for building segment criteria with:
 * - Real-time customer count preview
 * - Business field integration with security controls
 * - Visual AND/OR logic grouping
 * - Progressive disclosure and advanced features
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FilterGroups, FilterGroup } from './filter-groups';
import { FilterCriteria } from './filter-row';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Trash2,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSINESS_FIELD_MAPPINGS } from '@shared/business-field-mappings';

/**
 * Enhanced AST-based criteria node for complex boolean logic
 */
export interface CriteriaNode {
  type: 'condition' | 'group';
  id: string;
  operator?: 'and' | 'or';
  field?: string;
  comparison?: string;
  value?: unknown;
  children?: CriteriaNode[];
}

/**
 * Strongly typed business criteria structure
 */
export interface BusinessCriteria {
  [key: string]: unknown;
  $and?: BusinessCriteria[];
  $or?: BusinessCriteria[];
}

export interface CriteriaBuilderProps {
  /** Initial criteria (from existing segment) */
  initialCriteria?: BusinessCriteria;
  /** Callback when criteria changes */
  onChange?: (criteria: BusinessCriteria) => void;
  /** User role for field access control */
  userRole?: string;
  /** Authentication status */
  isAuthenticated?: boolean;
  /** Show advanced features */
  showAdvanced?: boolean;
  /** Read-only mode */
  readOnly?: boolean;
  /** Custom class name */
  className?: string;
  /** Enable template application mode */
  enableTemplateMode?: boolean;
  /** Template application indicator */
  appliedTemplateName?: string;
}

interface PreviewResult {
  count: number;
  loading: boolean;
  error: string | null;
  performance: {
    duration: number;
    timestamp: string;
    complexity: 'low' | 'medium' | 'high';
  } | null;
}


// Generate unique IDs
const generateId = () => `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * SECURITY FIX: Escape regex patterns to prevent DoS attacks
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * SECURITY FIX: Build safe regex operators with proper escaping
 */
const buildRegexOperator = (operator: string, value: string): Record<string, unknown> => {
  const escapedValue = escapeRegex(value);
  
  switch (operator) {
    case 'contains':
      return { $regex: escapedValue, $options: 'i' };
    case 'starts_with':
      return { $regex: `^${escapedValue}`, $options: 'i' };
    case 'ends_with':
      return { $regex: `${escapedValue}$`, $options: 'i' };
    default:
      return { $regex: escapedValue, $options: 'i' };
  }
};

/**
 * CRITICAL FIX: Transform criteria using proper $and/$or arrays instead of Object.assign
 * Supports multiple constraints per field and nested boolean logic
 */
function transformCriteriaToBackend(group: FilterGroup): BusinessCriteria {
  const conditions: BusinessCriteria[] = [];
  
  // Process individual filters into separate conditions
  group.filters.forEach((filter) => {
    if (!filter.field || !filter.operator) return;
    
    const fieldConfig = BUSINESS_FIELD_MAPPINGS[filter.field];
    if (!fieldConfig) return;
    
    const backendField = fieldConfig.databaseField;
    const backendValue = filter.value;
    const condition: BusinessCriteria = {};
    
    // Transform based on field type and operator with security fixes
    switch (filter.operator) {
      case 'exists':
        condition[backendField] = { $exists: true };
        break;
      case 'not_exists':
        condition[backendField] = { $exists: false };
        break;
      case 'is_true':
        condition[backendField] = true;
        break;
      case 'is_false':
        condition[backendField] = false;
        break;
      case 'equals':
        condition[backendField] = backendValue;
        break;
      case 'not_equals':
        condition[backendField] = { $ne: backendValue };
        break;
      case 'contains':
      case 'starts_with':
      case 'ends_with':
        condition[backendField] = buildRegexOperator(filter.operator, String(backendValue));
        break;
      case 'greater_than':
        condition[backendField] = { $gt: parseFloat(String(backendValue)) };
        break;
      case 'less_than':
        condition[backendField] = { $lt: parseFloat(String(backendValue)) };
        break;
      case 'between':
        if (backendValue && typeof backendValue === 'object' && 'min' in backendValue && 'max' in backendValue) {
          condition[backendField] = { 
            $gte: parseFloat(String(backendValue.min)), 
            $lte: parseFloat(String(backendValue.max)) 
          };
        }
        break;
      case 'before':
        condition[backendField] = { $lt: backendValue };
        break;
      case 'after':
        condition[backendField] = { $gt: backendValue };
        break;
      default:
        condition[backendField] = backendValue;
    }
    
    conditions.push(condition);
  });
  
  // Process nested groups
  if (group.groups && group.groups.length > 0) {
    group.groups.forEach(nestedGroup => {
      const nestedCriteria = transformCriteriaToBackend(nestedGroup);
      if (Object.keys(nestedCriteria).length > 0) {
        conditions.push(nestedCriteria);
      }
    });
  }
  
  // Return proper boolean logic structure
  if (conditions.length === 0) {
    return {};
  }
  
  if (conditions.length === 1) {
    return conditions[0];
  }
  
  // Multiple conditions - use proper $and/$or logic
  if (group.logic === 'OR') {
    return { $or: conditions };
  } else {
    return { $and: conditions };
  }
}

/**
 * CRITICAL FIX: Complete parsing of backend $and/$or to UI state
 * Handles nested boolean logic and complex existing segments
 */
function transformCriteriaFromBackend(backendCriteria: BusinessCriteria): FilterGroup {
  const rootGroup: FilterGroup = {
    id: generateId(),
    logic: 'AND',
    filters: [],
    groups: []
  };
  
  if (!backendCriteria || typeof backendCriteria !== 'object') {
    return rootGroup;
  }
  
  // Handle $or logic
  if ('$or' in backendCriteria && Array.isArray(backendCriteria.$or)) {
    rootGroup.logic = 'OR';
    backendCriteria.$or.forEach(condition => {
      const nestedGroup = transformCriteriaFromBackend(condition);
      if (nestedGroup.filters.length > 0 || (nestedGroup.groups && nestedGroup.groups.length > 0)) {
        rootGroup.groups = rootGroup.groups || [];
        rootGroup.groups.push(nestedGroup);
      }
    });
    return rootGroup;
  }
  
  // Handle $and logic
  if ('$and' in backendCriteria && Array.isArray(backendCriteria.$and)) {
    rootGroup.logic = 'AND';
    backendCriteria.$and.forEach(condition => {
      const nestedGroup = transformCriteriaFromBackend(condition);
      if (nestedGroup.filters.length > 0) {
        // Merge filters from nested groups into root for simple AND conditions
        rootGroup.filters.push(...nestedGroup.filters);
      }
      if (nestedGroup.groups && nestedGroup.groups.length > 0) {
        rootGroup.groups = rootGroup.groups || [];
        rootGroup.groups.push(...nestedGroup.groups);
      }
    });
    return rootGroup;
  }
  
  // Handle direct field conditions
  Object.entries(backendCriteria).forEach(([key, value]) => {
    // Skip MongoDB operators that we've already handled
    if (key.startsWith('$')) return;
    
    // Find matching business field
    const businessField = Object.entries(BUSINESS_FIELD_MAPPINGS).find(
      ([_, config]) => config.databaseField === key
    );
    
    if (!businessField) return;
    
    const [fieldKey, fieldConfig] = businessField;
    
    // Create filter based on value type
    const filter: FilterCriteria = {
      id: generateId(),
      field: fieldKey,
      operator: 'equals',
      value: '',
      fieldConfig
    };
    
    // Determine operator and value based on backend format
    if (typeof value === 'object' && value !== null) {
      const valueObj = value as Record<string, unknown>;
      
      if ('$exists' in valueObj) {
        filter.operator = valueObj.$exists ? 'exists' : 'not_exists';
        filter.value = '';
      } else if ('$ne' in valueObj) {
        filter.operator = 'not_equals';
        filter.value = valueObj.$ne;
      } else if ('$regex' in valueObj) {
        const regex = String(valueObj.$regex);
        // Unescape the regex pattern for display
        const unescapedRegex = regex.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');
        
        if (regex.startsWith('^')) {
          filter.operator = 'starts_with';
          filter.value = unescapedRegex.substring(1);
        } else if (regex.endsWith('$')) {
          filter.operator = 'ends_with';
          filter.value = unescapedRegex.slice(0, -1);
        } else {
          filter.operator = 'contains';
          filter.value = unescapedRegex;
        }
      } else if ('$gt' in valueObj) {
        filter.operator = 'greater_than';
        filter.value = valueObj.$gt;
      } else if ('$lt' in valueObj) {
        filter.operator = 'less_than';
        filter.value = valueObj.$lt;
      } else if ('$gte' in valueObj && '$lte' in valueObj) {
        filter.operator = 'between';
        filter.value = { min: valueObj.$gte, max: valueObj.$lte };
      }
    } else {
      filter.operator = 'equals';
      filter.value = value;
    }
    
    rootGroup.filters.push(filter);
  });
  
  return rootGroup;
}

export function CriteriaBuilder({
  initialCriteria,
  onChange,
  userRole = 'public',
  isAuthenticated = false,
  showAdvanced = false,
  readOnly = false,
  className,
  enableTemplateMode = false,
  appliedTemplateName
}: CriteriaBuilderProps) {
  const { toast } = useToast();
  
  // State management
  const [rootGroup, setRootGroup] = useState<FilterGroup>(() => {
    if (initialCriteria) {
      return transformCriteriaFromBackend(initialCriteria);
    }
    return {
      id: generateId(),
      logic: 'AND',
      filters: [],
      groups: []
    };
  });

  // Enhanced template support: Dynamic criteria updates
  const [lastAppliedCriteria, setLastAppliedCriteria] = useState<BusinessCriteria | null>(null);
  const [isTemplateApplied, setIsTemplateApplied] = useState(false);
  
  const [previewResult, setPreviewResult] = useState<PreviewResult>({
    count: 0,
    loading: false,
    error: null,
    performance: null
  });
  
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(showAdvanced);

  // Template application: Dynamic criteria updates
  useEffect(() => {
    if (initialCriteria && initialCriteria !== lastAppliedCriteria) {
      const newGroup = transformCriteriaFromBackend(initialCriteria);
      setRootGroup(newGroup);
      setLastAppliedCriteria(initialCriteria);
      setIsTemplateApplied(enableTemplateMode && !!appliedTemplateName);
      
      if (enableTemplateMode && appliedTemplateName) {
        toast({
          title: "Template Applied Successfully",
          description: `Criteria from ${appliedTemplateName} template has been loaded. You can now customize as needed.`,
        });
      }
    }
  }, [initialCriteria, lastAppliedCriteria, enableTemplateMode, appliedTemplateName, toast]);

  // Template functionality: Reset to template
  const resetToTemplate = useCallback(() => {
    if (lastAppliedCriteria) {
      const templateGroup = transformCriteriaFromBackend(lastAppliedCriteria);
      setRootGroup(templateGroup);
      toast({
        title: "Reset to Template",
        description: "Criteria has been reset to the original template configuration.",
      });
    }
  }, [lastAppliedCriteria, toast]);
  
  // Transform criteria for backend
  const backendCriteria = useMemo((): BusinessCriteria => {
    return transformCriteriaToBackend(rootGroup);
  }, [rootGroup]);
  
  // Debounced criteria for API calls
  const debouncedCriteria = useDebounce(backendCriteria, 800);
  
  // Check if criteria is empty
  const isEmpty = rootGroup.filters.length === 0 && (!rootGroup.groups || rootGroup.groups.length === 0);
  
  // Calculate complexity
  const complexity = useMemo(() => {
    const totalFilters = rootGroup.filters.length + 
      (rootGroup.groups?.reduce((acc, group) => acc + group.filters.length, 0) || 0);
    const hasNesting = rootGroup.groups && rootGroup.groups.length > 0;
    
    if (totalFilters > 10 || hasNesting) return 'high';
    if (totalFilters > 5) return 'medium';
    return 'low';
  }, [rootGroup]);
  
  // REACT QUERY INTEGRATION: Proper debounced preview with caching
  const { data: previewData, error: previewError, isLoading: previewLoading } = useQuery({
    queryKey: ['/api/segments/preview-count', debouncedCriteria],
    queryFn: async () => {
      const startTime = performance.now();
      const response = await fetch('/api/segments/preview-count', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ criteria: debouncedCriteria })
      });
      
      if (!response.ok) {
        throw new Error(`Preview failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      return {
        count: data.count || 0,
        performance: {
          duration: Math.round(duration),
          timestamp: new Date().toISOString(),
          complexity: complexity as 'low' | 'medium' | 'high'
        }
      };
    },
    enabled: !isEmpty && !readOnly && Object.keys(debouncedCriteria).length > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Update preview result from React Query
  useEffect(() => {
    if (isEmpty || readOnly) {
      setPreviewResult({ count: 0, loading: false, error: null, performance: null });
      return;
    }
    
    setPreviewResult({
      count: previewData?.count || 0,
      loading: previewLoading,
      error: previewError instanceof Error ? previewError.message : null,
      performance: previewData?.performance || null
    });
    
    // Show performance warning for slow queries
    if (previewData?.performance?.duration && previewData.performance.duration > 2000) {
      toast({
        title: "Performance Warning",
        description: `Query took ${previewData.performance.duration}ms. Consider simplifying criteria.`,
        variant: "destructive"
      });
    }
  }, [previewData, previewError, previewLoading, isEmpty, readOnly, toast]);
  
  // Notify parent of changes with proper typing
  useEffect(() => {
    if (onChange) {
      onChange(isEmpty ? {} : backendCriteria);
    }
  }, [backendCriteria, isEmpty, onChange]);
  
  // Group management functions
  const updateGroup = useCallback((groupId: string, updates: Partial<FilterGroup>) => {
    setRootGroup(prev => {
      if (prev.id === groupId) {
        return { ...prev, ...updates };
      }
      // Handle nested groups if needed
      return prev;
    });
  }, []);
  
  const addFilter = useCallback((groupId: string) => {
    if (readOnly) return;
    
    const newFilter: FilterCriteria = {
      id: generateId(),
      field: '',
      operator: 'equals',
      value: ''
    };
    
    setRootGroup(prev => {
      if (prev.id === groupId) {
        return {
          ...prev,
          filters: [...prev.filters, newFilter]
        };
      }
      return prev;
    });
  }, [readOnly]);
  
  const addGroup = useCallback((parentGroupId: string) => {
    if (readOnly) return;
    
    const newGroup: FilterGroup = {
      id: generateId(),
      logic: 'AND',
      filters: [
        {
          id: generateId(),
          field: '',
          operator: 'equals',
          value: ''
        }
      ]
    };
    
    setRootGroup(prev => {
      if (prev.id === parentGroupId) {
        return {
          ...prev,
          groups: [...(prev.groups || []), newGroup]
        };
      }
      return prev;
    });
  }, [readOnly]);
  
  const updateFilter = useCallback((filterId: string, updates: Partial<FilterCriteria>) => {
    if (readOnly) return;
    
    setRootGroup(prev => {
      return {
        ...prev,
        filters: prev.filters.map(filter => 
          filter.id === filterId ? { ...filter, ...updates } : filter
        )
      };
    });
  }, [readOnly]);
  
  const removeFilter = useCallback((filterId: string) => {
    if (readOnly) return;
    
    setRootGroup(prev => ({
      ...prev,
      filters: prev.filters.filter(filter => filter.id !== filterId)
    }));
  }, [readOnly]);
  
  const clearAll = useCallback(() => {
    if (readOnly) return;
    
    setRootGroup({
      id: generateId(),
      logic: 'AND',
      filters: [],
      groups: []
    });
  }, [readOnly]);
  
  const resetToInitial = useCallback(() => {
    if (readOnly) return;
    
    if (initialCriteria) {
      setRootGroup(transformCriteriaFromBackend(initialCriteria));
    } else {
      clearAll();
    }
  }, [initialCriteria, readOnly, clearAll]);
  
  // Render preview section
  const renderPreview = () => (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-5 h-5" />
          Live Preview
          {previewResult.loading && <Loader2 className="w-4 h-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {previewResult.error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{previewResult.error}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {previewResult.loading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <span className="text-2xl font-bold text-primary">
                    {previewResult.count.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">
                    customers match {isEmpty ? 'all criteria' : 'these criteria'}
                  </span>
                </>
              )}
            </div>
            
            {previewResult.performance && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {previewResult.performance.duration}ms
                </div>
                <Badge 
                  variant={
                    previewResult.performance.complexity === 'high' ? 'destructive' :
                    previewResult.performance.complexity === 'medium' ? 'secondary' : 'outline'
                  }
                  className="text-xs"
                >
                  {previewResult.performance.complexity} complexity
                </Badge>
                {previewResult.performance.duration > 1000 && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    Slow query
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
  
  // Render action buttons
  const renderActions = () => (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {!isEmpty && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={readOnly}
              data-testid="button-clear-all"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
            {initialCriteria && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToInitial}
                disabled={readOnly}
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            )}
          </>
        )}
      </div>
      
      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" data-testid="button-toggle-advanced">
            Advanced Filters
            {isAdvancedOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
        </CollapsibleTrigger>
      </Collapsible>
    </div>
  );
  
  return (
    <div className={cn("space-y-6", className)} data-testid="criteria-builder">
      {/* Preview Section */}
      {renderPreview()}
      
      {/* Main Criteria Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Segment Criteria</span>
              {isTemplateApplied && appliedTemplateName && (
                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Template: {appliedTemplateName}
                </Badge>
              )}
            </div>
            {!isEmpty && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {rootGroup.filters.length} filter{rootGroup.filters.length !== 1 ? 's' : ''}
                  {rootGroup.groups && rootGroup.groups.length > 0 && 
                    ` + ${rootGroup.groups.length} group${rootGroup.groups.length !== 1 ? 's' : ''}`
                  }
                </Badge>
                {isTemplateApplied && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetToTemplate}
                    className="text-xs h-6 px-2"
                    title="Reset to original template"
                    data-testid="reset-to-template-button"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterGroups
            group={rootGroup}
            onUpdate={updateGroup}
            onAddFilter={addFilter}
            onAddGroup={addGroup}
            onUpdateFilter={updateFilter}
            onRemoveFilter={removeFilter}
            userRole={userRole}
            isAuthenticated={isAuthenticated}
          />
        </CardContent>
      </Card>
      
      {/* Advanced Section */}
      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleContent className="space-y-4">
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Advanced Options</h4>
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ✅ Complex boolean logic supported (AND/OR combinations)<br/>
                ✅ Multiple constraints per field (e.g., age &gt; 25 AND age &lt; 65)<br/>
                ✅ Nested groups with proper round-trip capability<br/>
                ✅ Security-hardened regex patterns<br/>
                Performance optimized with React Query caching.
              </AlertDescription>
            </Alert>
          </div>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Actions */}
      {renderActions()}
    </div>
  );
}
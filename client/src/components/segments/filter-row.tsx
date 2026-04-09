/**
 * Filter Row Component - Individual criteria filter with field/operator/value inputs
 * 
 * Provides visual interface for building individual segment criteria with business-friendly
 * field selection, appropriate operators, and type-safe value inputs based on field types.
 */

import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  BUSINESS_FIELD_MAPPINGS, 
  FieldDataType, 
  QueryPattern,
  FieldMappingConfig,
  getAvailableCategories,
  getFieldMappingsByCategory 
} from '@shared/business-field-mappings';

export interface FilterCriteria {
  id: string;
  field: string;
  operator: string;
  value: any;
  fieldConfig?: FieldMappingConfig;
}

interface FilterRowProps {
  filter: FilterCriteria;
  onUpdate: (filterId: string, updates: Partial<FilterCriteria>) => void;
  onRemove: (filterId: string) => void;
  isRemovable?: boolean;
  userRole?: string;
  isAuthenticated?: boolean;
}

/**
 * Get available operators based on field data type and query pattern
 */
function getOperatorsForField(fieldConfig: FieldMappingConfig): Array<{value: string, label: string}> {
  const { dataType, queryPattern } = fieldConfig;
  
  switch (dataType) {
    case FieldDataType.BOOLEAN:
      return [
        { value: 'is_true', label: 'is true' },
        { value: 'is_false', label: 'is false' }
      ];
      
    case FieldDataType.STRING:
    case FieldDataType.EMAIL:
    case FieldDataType.PHONE:
    case FieldDataType.JSONB_TEXT:
      if (queryPattern === QueryPattern.EXISTENCE_CHECK) {
        return [
          { value: 'exists', label: 'exists' },
          { value: 'not_exists', label: 'does not exist' }
        ];
      }
      return [
        { value: 'equals', label: 'equals' },
        { value: 'contains', label: 'contains' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'ends_with', label: 'ends with' },
        { value: 'not_equals', label: 'does not equal' }
      ];
      
    case FieldDataType.NUMBER:
    case FieldDataType.JSONB_NUMBER:
      return [
        { value: 'equals', label: 'equals' },
        { value: 'greater_than', label: 'greater than' },
        { value: 'less_than', label: 'less than' },
        { value: 'between', label: 'between' },
        { value: 'not_equals', label: 'does not equal' }
      ];
      
    case FieldDataType.DATE:
      return [
        { value: 'before', label: 'before' },
        { value: 'after', label: 'after' },
        { value: 'between', label: 'between' },
        { value: 'equals', label: 'on date' }
      ];
      
    case FieldDataType.ADDRESS:
      return [
        { value: 'contains', label: 'contains' },
        { value: 'exact_match', label: 'exact match' }
      ];
      
    default:
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' }
      ];
  }
}

/**
 * Get predefined values for fields that have limited options
 */
function getPredefinedValues(fieldConfig: FieldMappingConfig): Array<{value: any, label: string}> | null {
  const { businessTerm, dataType } = fieldConfig;
  
  if (businessTerm === 'gender') {
    return [
      { value: 'Male', label: 'Male' },
      { value: 'Female', label: 'Female' },
      { value: 'Other', label: 'Other' },
      { value: 'Prefer not to say', label: 'Prefer not to say' }
    ];
  }
  
  if (businessTerm === 'customer_segment') {
    return [
      { value: 'Premium', label: 'Premium' },
      { value: 'Standard', label: 'Standard' },
      { value: 'Basic', label: 'Basic' },
      { value: 'VIP', label: 'VIP' },
      { value: 'Inactive', label: 'Inactive' }
    ];
  }
  
  if (dataType === FieldDataType.BOOLEAN) {
    return [
      { value: true, label: 'True' },
      { value: false, label: 'False' }
    ];
  }
  
  return null;
}

export function FilterRow({ 
  filter, 
  onUpdate, 
  onRemove, 
  isRemovable = true,
  userRole = 'public',
  isAuthenticated = false 
}: FilterRowProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Get field configuration
  const fieldConfig = filter.field ? BUSINESS_FIELD_MAPPINGS[filter.field] : null;
  
  // Get available fields filtered by user access
  const availableFields = Object.entries(BUSINESS_FIELD_MAPPINGS)
    .filter(([_, config]) => {
      // Basic access level check
      if (config.accessLevel === 'restricted' && userRole !== 'super_admin') return false;
      if (config.accessLevel === 'sensitive' && !['admin', 'super_admin'].includes(userRole)) return false;
      if (config.accessLevel === 'protected' && !['admin', 'super_admin', 'analyst'].includes(userRole)) return false;
      if (config.requiresAuth && !isAuthenticated) return false;
      
      return true;
    })
    .map(([key, config]) => ({
      value: key,
      label: config.displayName,
      category: config.category,
      description: config.description
    }));
  
  // Group fields by category for better UX
  const fieldsByCategory = getAvailableCategories().reduce((acc, category) => {
    acc[category] = availableFields.filter(field => field.category === category);
    return acc;
  }, {} as Record<string, typeof availableFields>);
  
  // Get operators for current field
  const availableOperators = fieldConfig ? getOperatorsForField(fieldConfig) : [];
  
  // Get predefined values if applicable
  const predefinedValues = fieldConfig ? getPredefinedValues(fieldConfig) : null;
  
  // Handle field change
  const handleFieldChange = useCallback((newField: string) => {
    const newFieldConfig = BUSINESS_FIELD_MAPPINGS[newField];
    const defaultOperators = newFieldConfig ? getOperatorsForField(newFieldConfig) : [];
    const defaultOperator = defaultOperators[0]?.value || 'equals';
    
    onUpdate(filter.id, {
      field: newField,
      operator: defaultOperator,
      value: '',
      fieldConfig: newFieldConfig
    });
  }, [filter.id, onUpdate]);
  
  // Handle operator change
  const handleOperatorChange = useCallback((newOperator: string) => {
    onUpdate(filter.id, { 
      operator: newOperator,
      // Reset value if changing to/from between operator
      value: newOperator === 'between' ? { min: '', max: '' } : ''
    });
  }, [filter.id, onUpdate]);
  
  // Handle value change
  const handleValueChange = useCallback((newValue: any) => {
    onUpdate(filter.id, { value: newValue });
  }, [filter.id, onUpdate]);
  
  // Render value input based on field type and operator
  const renderValueInput = () => {
    if (!fieldConfig) return null;
    
    const { dataType } = fieldConfig;
    const { operator } = filter;
    
    // Boolean fields don't need value input for existence checks
    if (dataType === FieldDataType.BOOLEAN && ['exists', 'not_exists', 'is_true', 'is_false'].includes(operator)) {
      return null;
    }
    
    // Between operator needs two inputs
    if (operator === 'between') {
      if (dataType === FieldDataType.DATE) {
        return (
          <div className="flex gap-2 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-32 justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filter.value?.min ? format(new Date(filter.value.min), 'PPP') : 'Start date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filter.value?.min ? new Date(filter.value.min) : undefined}
                  onSelect={(date) => handleValueChange({ ...filter.value, min: date?.toISOString() })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-muted-foreground">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-32 justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filter.value?.max ? format(new Date(filter.value.max), 'PPP') : 'End date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filter.value?.max ? new Date(filter.value.max) : undefined}
                  onSelect={(date) => handleValueChange({ ...filter.value, max: date?.toISOString() })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        );
      } else {
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              placeholder="Min"
              value={filter.value?.min || ''}
              onChange={(e) => handleValueChange({ ...filter.value, min: e.target.value })}
              className="w-20"
              data-testid={`input-filter-min-${filter.id}`}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={filter.value?.max || ''}
              onChange={(e) => handleValueChange({ ...filter.value, max: e.target.value })}
              className="w-20"
              data-testid={`input-filter-max-${filter.id}`}
            />
          </div>
        );
      }
    }
    
    // Date fields
    if (dataType === FieldDataType.DATE) {
      return (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-48 justify-start text-left font-normal", !filter.value && "text-muted-foreground")}
              data-testid={`button-date-picker-${filter.id}`}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filter.value ? format(new Date(filter.value), 'PPP') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={filter.value ? new Date(filter.value) : undefined}
              onSelect={(date) => {
                handleValueChange(date?.toISOString());
                setDatePickerOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      );
    }
    
    // Predefined values (dropdown)
    if (predefinedValues) {
      return (
        <Select value={filter.value?.toString() || ''} onValueChange={handleValueChange}>
          <SelectTrigger className="w-48" data-testid={`select-predefined-value-${filter.id}`}>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {predefinedValues.map((option) => (
              <SelectItem key={option.value.toString()} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    // Number fields
    if (dataType === FieldDataType.NUMBER || dataType === FieldDataType.JSONB_NUMBER) {
      return (
        <Input
          type="number"
          placeholder="Enter number"
          value={filter.value || ''}
          onChange={(e) => handleValueChange(e.target.value)}
          className="w-48"
          data-testid={`input-number-${filter.id}`}
        />
      );
    }
    
    // Default text input
    return (
      <Input
        type="text"
        placeholder="Enter value"
        value={filter.value || ''}
        onChange={(e) => handleValueChange(e.target.value)}
        className="w-48"
        data-testid={`input-text-${filter.id}`}
      />
    );
  };
  
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-background">
      {/* Field Selector */}
      <div className="flex-1 min-w-48">
        <Select value={filter.field || ''} onValueChange={handleFieldChange}>
          <SelectTrigger data-testid={`select-field-${filter.id}`}>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(fieldsByCategory).map(([category, fields]) => 
              fields.length > 0 && (
                <div key={category}>
                  <div className="px-2 py-1 text-sm font-medium text-muted-foreground">
                    {category}
                  </div>
                  {fields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      <div className="flex flex-col">
                        <span>{field.label}</span>
                        <span className="text-xs text-muted-foreground">{field.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              )
            )}
          </SelectContent>
        </Select>
      </div>
      
      {/* Operator Selector */}
      {fieldConfig && (
        <div className="min-w-32">
          <Select value={filter.operator || ''} onValueChange={handleOperatorChange}>
            <SelectTrigger data-testid={`select-operator-${filter.id}`}>
              <SelectValue placeholder="Operator" />
            </SelectTrigger>
            <SelectContent>
              {availableOperators.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Value Input */}
      {fieldConfig && renderValueInput()}
      
      {/* Field Info Badge */}
      {fieldConfig && (
        <Badge 
          variant={fieldConfig.sensitiveData ? "destructive" : fieldConfig.requiresAuth ? "secondary" : "outline"}
          className="text-xs"
        >
          {fieldConfig.category}
        </Badge>
      )}
      
      {/* Remove Button */}
      {isRemovable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(filter.id)}
          className="text-muted-foreground hover:text-destructive"
          data-testid={`button-remove-filter-${filter.id}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
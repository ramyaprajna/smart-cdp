import { memo, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterField {
  key: string;
  label: string;
  dataType: string;
}

interface Filter {
  field: string;
  operator: string;
  value: string;
}

interface RecordFilterBarProps {
  fields: FilterField[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
}

// Operators available for each data type
const OPERATORS_BY_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  string: [
    { value: 'eq', label: 'equals' },
    { value: 'ne', label: 'not equals' },
    { value: 'contains', label: 'contains' },
  ],
  number: [
    { value: 'eq', label: '= equals' },
    { value: 'ne', label: '≠ not equals' },
    { value: 'gt', label: '> greater than' },
    { value: 'lt', label: '< less than' },
  ],
  date: [
    { value: 'eq', label: 'on' },
    { value: 'gt', label: 'after' },
    { value: 'lt', label: 'before' },
  ],
  boolean: [
    { value: 'eq', label: 'equals' },
  ],
};

const DEFAULT_OPERATORS = OPERATORS_BY_TYPE['string'];

function getOperatorsForType(dataType: string) {
  return OPERATORS_BY_TYPE[dataType] ?? DEFAULT_OPERATORS;
}

function getDefaultOperator(dataType: string): string {
  return getOperatorsForType(dataType)[0]?.value ?? 'eq';
}

function BooleanValueSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="flex-1">
        <SelectValue placeholder="Select value" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">true</SelectItem>
        <SelectItem value="false">false</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default memo(function RecordFilterBar({
  fields,
  filters,
  onFiltersChange,
}: RecordFilterBarProps) {
  const addFilter = useCallback(() => {
    const firstField = fields[0];
    if (!firstField) return;
    onFiltersChange([
      ...filters,
      {
        field: firstField.key,
        operator: getDefaultOperator(firstField.dataType),
        value: '',
      },
    ]);
  }, [fields, filters, onFiltersChange]);

  const removeFilter = useCallback(
    (idx: number) => {
      onFiltersChange(filters.filter((_, i) => i !== idx));
    },
    [filters, onFiltersChange]
  );

  const updateFilter = useCallback(
    (idx: number, patch: Partial<Filter>) => {
      const updated = filters.map((f, i) => (i === idx ? { ...f, ...patch } : f));
      onFiltersChange(updated);
    },
    [filters, onFiltersChange]
  );

  const handleFieldChange = useCallback(
    (idx: number, newField: string) => {
      const fieldDef = fields.find((f) => f.key === newField);
      const newOperator = fieldDef ? getDefaultOperator(fieldDef.dataType) : 'eq';
      updateFilter(idx, { field: newField, operator: newOperator, value: '' });
    },
    [fields, updateFilter]
  );

  return (
    <div className="space-y-2">
      {filters.map((filter, idx) => {
        const fieldDef = fields.find((f) => f.key === filter.field);
        const operators = getOperatorsForType(fieldDef?.dataType ?? 'string');
        const isBoolean = fieldDef?.dataType === 'boolean';

        return (
          <div key={idx} className="flex items-center gap-2">
            {/* Field selector */}
            <Select
              value={filter.field}
              onValueChange={(val) => handleFieldChange(idx, val)}
            >
              <SelectTrigger className="w-[160px] shrink-0">
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator selector */}
            <Select
              value={filter.operator}
              onValueChange={(val) => updateFilter(idx, { operator: val })}
            >
              <SelectTrigger className="w-[140px] shrink-0">
                <SelectValue placeholder="Operator" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value input — boolean gets a Select, others get a text Input */}
            {isBoolean ? (
              <BooleanValueSelect
                value={filter.value}
                onChange={(val) => updateFilter(idx, { value: val })}
              />
            ) : (
              <Input
                value={filter.value}
                onChange={(e) => updateFilter(idx, { value: e.target.value })}
                placeholder="Value"
                className="flex-1"
                type={fieldDef?.dataType === 'number' ? 'number' : fieldDef?.dataType === 'date' ? 'date' : 'text'}
              />
            )}

            {/* Remove button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeFilter(idx)}
              aria-label="Remove filter"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={addFilter} disabled={fields.length === 0}>
        <Plus className="h-4 w-4 mr-1" />
        Add Filter
      </Button>
    </div>
  );
});

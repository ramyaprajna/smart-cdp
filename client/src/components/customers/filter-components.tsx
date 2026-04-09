/**
 * Reusable filter component library
 * Contains common UI patterns used across the customer filter dialog
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { X, RotateCcw } from "lucide-react";
import { CustomerFilters } from "./customer-filters";
import { formatFilterDisplay, isFilterActive } from "./filter-utils";

// Props interfaces for reusable components
interface FilterSelectProps {
  label: string;
  value: string | undefined;
  placeholder: string;
  options: readonly string[];
  onValueChange: (value: string | undefined) => void;
  id?: string;
}

interface FilterRangeProps {
  label: string;
  minValue: number | undefined;
  maxValue: number | undefined;
  minPlaceholder: string;
  maxPlaceholder: string;
  onMinChange: (value: number | undefined) => void;
  onMaxChange: (value: number | undefined) => void;
  minLabel?: string;
  maxLabel?: string;
}

interface FilterSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  values: [number, number];
  onValueChange: (values: [number, number]) => void;
  formatValue?: (value: number) => string;
}

interface FilterCheckboxGroupProps {
  label: string;
  options: Array<{
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    exclusiveWith?: string;
  }>;
}

interface ActiveFiltersDisplayProps {
  filters: CustomerFilters;
  onRemoveFilter: (key: keyof CustomerFilters) => void;
  onClearAll: () => void;
}

/**
 * Reusable select dropdown component for filters
 * Handles "All" option pattern and value conversion
 */
export function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onValueChange,
  id
}: FilterSelectProps) {
  const handleValueChange = (selectedValue: string) => {
    onValueChange(selectedValue === "all" ? undefined : selectedValue);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "all"} onValueChange={handleValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {label}s</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Reusable min/max input range component
 * Handles number inputs with proper validation
 */
export function FilterRange({
  label,
  minValue,
  maxValue,
  minPlaceholder,
  maxPlaceholder,
  onMinChange,
  onMaxChange,
  minLabel = "Minimum",
  maxLabel = "Maximum"
}: FilterRangeProps) {
  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onMinChange(value ? Number(value) : undefined);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onMaxChange(value ? Number(value) : undefined);
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">{minLabel}</Label>
          <Input
            type="number"
            placeholder={minPlaceholder}
            value={minValue || ""}
            onChange={handleMinChange}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{maxLabel}</Label>
          <Input
            type="number"
            placeholder={maxPlaceholder}
            value={maxValue || ""}
            onChange={handleMaxChange}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable slider component with value display
 * Supports custom formatting for different value types
 */
export function FilterSlider({
  label,
  min,
  max,
  step,
  values,
  onValueChange,
  formatValue = (value) => value.toString()
}: FilterSliderProps) {
  const handleValueChange = (newValues: number[]) => {
    const [minVal, maxVal] = newValues;
    onValueChange([
      minVal === min ? min : minVal,
      maxVal === max ? max : maxVal
    ]);
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="px-3">
        <Slider
          value={values}
          onValueChange={handleValueChange}
          max={max}
          min={min}
          step={step}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-muted-foreground mt-1">
          <span>{formatValue(values[0])}</span>
          <span>{formatValue(values[1])}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable checkbox group component
 * Handles exclusive checkbox logic (radio button behavior)
 */
export function FilterCheckboxGroup({ label, options }: FilterCheckboxGroupProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {options.map((option) => (
        <div key={option.id} className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={option.id}
            checked={option.checked}
            onChange={(e) => option.onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
          />
          <Label htmlFor={option.id} className="text-sm font-normal cursor-pointer">
            {option.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

/**
 * Active filters display component
 * Shows current filters with remove buttons and clear all option
 */
export function ActiveFiltersDisplay({
  filters,
  onRemoveFilter,
  onClearAll
}: ActiveFiltersDisplayProps) {
  const activeFilters = Object.entries(filters).filter(([, value]) => isFilterActive(value));

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Active Filters</Label>
      <div className="flex flex-wrap gap-2">
        {activeFilters.map(([key, value]) => {
          const displayValue = formatFilterDisplay(key, value);

          return (
            <Badge key={key} variant="secondary" className="gap-1">
              {displayValue}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => onRemoveFilter(key as keyof CustomerFilters)}
              >
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          );
        })}
        <Button variant="outline" size="sm" onClick={onClearAll}>
          <RotateCcw className="w-3 h-3 mr-1" />
          Clear All
        </Button>
      </div>
    </div>
  );
}

/**
 * Utility functions and constants for customer filtering
 * Centralizes filter logic and display formatting
 */

import { CustomerFilters } from "./customer-filters";

// Filter option constants
export const FILTER_OPTIONS = {
  segments: ["Professional", "Student", "Regular Listener", "Entrepreneur"],
  cities: ["Jakarta", "Tangerang", "Depok", "Bogor", "Bekasi", "Bandung", "Surabaya"],
  genders: ["Male", "Female"],
  professions: [
    "Software Engineer", "Teacher", "Doctor", "Student", "Entrepreneur",
    "Marketing", "Sales", "Government Employee", "Private Employee", "Business Owner"
  ],
  activityDays: [
    { value: "7", label: "Within 7 days" },
    { value: "30", label: "Within 30 days" },
    { value: "90", label: "Within 90 days" },
    { value: "365", label: "Within 1 year" }
  ]
} as const;

// Data quality and value ranges
export const FILTER_RANGES = {
  dataQuality: { min: 0, max: 100, step: 5 },
  age: { min: 18, max: 65 },
  lifetimeValue: { min: 0, max: 10000 }
} as const;

/**
 * Formats filter values for display in active filter badges
 * Converts technical filter keys into user-friendly labels
 */
export function formatFilterDisplay(key: string, value: any): string {
  // Handle boolean filters with clear labels
  const booleanFilters: Record<string, string> = {
    hasEmail: "Has Email",
    hasPhone: "Has Phone",
    missingEmail: "Missing Email",
    missingPhone: "Missing Phone"
  };

  if (key in booleanFilters && value === true) {
    return booleanFilters[key];
  }

  // Handle min/max range filters
  if (key.includes("Min") || key.includes("Max")) {
    const fieldName = key
      .replace("Min", "")
      .replace("Max", "")
      .replace("dataQuality", "Quality")
      .replace("lifetimeValue", "LTV");

    const operator = key.includes("Min") ? "≥" : "≤";
    const unit = getFilterUnit(key);

    return `${fieldName} ${operator} ${value}${unit}`;
  }

  // Default: return string value
  return String(value);
}

/**
 * Gets the appropriate unit symbol for filter types
 */
function getFilterUnit(key: string): string {
  if (key.includes("dataQuality")) return "%";
  if (key.includes("lifetimeValue")) return "$";
  return "";
}

/**
 * Checks if a filter value is considered "active" (not empty/undefined/null)
 */
export function isFilterActive(value: any): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Counts the number of active filters in a filter object
 */
export function countActiveFilters(filters: CustomerFilters): number {
  return Object.values(filters).filter(isFilterActive).length;
}

/**
 * Creates a clean filters object with undefined values removed
 */
export function cleanFilters(filters: CustomerFilters): CustomerFilters {
  const cleaned: CustomerFilters = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (isFilterActive(value)) {
      cleaned[key as keyof CustomerFilters] = value;
    }
  });

  return cleaned;
}

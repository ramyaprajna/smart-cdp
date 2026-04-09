/**
 * Customer filtering utilities
 * Extracts complex filtering logic for better maintainability
 */

import { Customer } from "@shared/schema";
import { CustomerFilters } from "@/components/customers/customer-filters";

/**
 * Calculates age from date of birth
 */
export function calculateAge(dateOfBirth: string | Date | null): number {
  if (!dateOfBirth) return 0;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();

  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Extracts city from customer address data
 */
export function extractCustomerCity(customer: Customer): string {
  if (!customer.currentAddress) return "";

  const address = customer.currentAddress as any;
  return address?.city || address?.kota || "";
}

/**
 * Extracts profession from customer address data
 */
export function extractCustomerProfession(customer: Customer): string {
  if (!customer.currentAddress) return "";

  const address = customer.currentAddress as any;
  return address?.profession || address?.pekerjaan || "";
}

/**
 * Type-safe filter functions for each filter type
 */
export const filterFunctions = {
  segment: (customer: Customer, filterValue: string): boolean => {
    return customer.customerSegment === filterValue;
  },

  dataQuality: (customer: Customer, min?: number, max?: number): boolean => {
    const quality = parseFloat(String(customer.dataQualityScore || '0'));
    if (min !== undefined && quality < min) return false;
    if (max !== undefined && quality > max) return false;
    return true;
  },

  lifetimeValue: (customer: Customer, min?: number, max?: number): boolean => {
    const ltv = parseFloat(String(customer.lifetimeValue || '0'));
    if (min !== undefined && ltv < min) return false;
    if (max !== undefined && ltv > max) return false;
    return true;
  },

  city: (customer: Customer, filterValue: string): boolean => {
    return extractCustomerCity(customer) === filterValue;
  },

  gender: (customer: Customer, filterValue: string): boolean => {
    return customer.gender === filterValue;
  },

  age: (customer: Customer, min?: number, max?: number): boolean => {
    const age = calculateAge(customer.dateOfBirth);
    if (min !== undefined && age < min) return false;
    if (max !== undefined && age > max) return false;
    return true;
  },

  profession: (customer: Customer, filterValue: string): boolean => {
    return extractCustomerProfession(customer) === filterValue;
  },

  email: (customer: Customer, hasEmail?: boolean, missingEmail?: boolean): boolean => {
    if (hasEmail === true && !customer.email) return false;
    if (missingEmail === true && customer.email) return false;
    return true;
  },

  phone: (customer: Customer, hasPhone?: boolean, missingPhone?: boolean): boolean => {
    if (hasPhone === true && !customer.phoneNumber) return false;
    if (missingPhone === true && customer.phoneNumber) return false;
    return true;
  }
};

/**
 * Applies all filters to a customer
 * Returns true if customer passes all active filters
 */
export function applyCustomerFilters(customer: Customer, filters: CustomerFilters): boolean {
  // Segment filter
  if (filters.segment && !filterFunctions.segment(customer, filters.segment)) {
    return false;
  }

  // Data quality filter
  if ((filters.dataQualityMin !== undefined || filters.dataQualityMax !== undefined) &&
      !filterFunctions.dataQuality(customer, filters.dataQualityMin, filters.dataQualityMax)) {
    return false;
  }

  // Lifetime value filter
  if ((filters.lifetimeValueMin !== undefined || filters.lifetimeValueMax !== undefined) &&
      !filterFunctions.lifetimeValue(customer, filters.lifetimeValueMin, filters.lifetimeValueMax)) {
    return false;
  }

  // City filter
  if (filters.city && !filterFunctions.city(customer, filters.city)) {
    return false;
  }

  // Gender filter
  if (filters.gender && !filterFunctions.gender(customer, filters.gender)) {
    return false;
  }

  // Age filter
  if ((filters.ageMin !== undefined || filters.ageMax !== undefined) &&
      !filterFunctions.age(customer, filters.ageMin, filters.ageMax)) {
    return false;
  }

  // Profession filter
  if (filters.profession && !filterFunctions.profession(customer, filters.profession)) {
    return false;
  }

  // Email filters
  if ((filters.hasEmail !== undefined || filters.missingEmail !== undefined) &&
      !filterFunctions.email(customer, filters.hasEmail, filters.missingEmail)) {
    return false;
  }

  // Phone filters
  if ((filters.hasPhone !== undefined || filters.missingPhone !== undefined) &&
      !filterFunctions.phone(customer, filters.hasPhone, filters.missingPhone)) {
    return false;
  }

  return true;
}

/**
 * Filters an array of customers based on provided filters
 */
export function filterCustomers(customers: Customer[], filters: CustomerFilters): Customer[] {
  if (!customers || !customers.length) return [];

  return customers.filter(customer => applyCustomerFilters(customer, filters));
}

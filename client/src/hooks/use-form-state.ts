/**
 * Generic form state management hook
 * Handles form data, validation, and submission patterns
 */

import { useState, useCallback } from "react";

export interface UseFormStateReturn<T> {
  formData: T;
  isSubmitting: boolean;
  errors: Partial<Record<keyof T, string>>;
  updateField: (field: keyof T, value: any) => void;
  updateMultipleFields: (updates: Partial<T>) => void;
  resetForm: (initialData?: T) => void;
  setSubmitting: (submitting: boolean) => void;
  setErrors: (errors: Partial<Record<keyof T, string>>) => void;
  clearErrors: () => void;
  validateField: (field: keyof T, validator: (value: any) => string | null) => boolean;
}

/**
 * Hook for managing form state with validation and submission handling
 * Reduces repetitive form management code across components
 */
export function useFormState<T extends Record<string, any>>(
  initialData: T
): UseFormStateReturn<T> {
  const [formData, setFormData] = useState<T>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const updateField = useCallback((field: keyof T, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const updateMultipleFields = useCallback((updates: Partial<T>) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const resetForm = useCallback((newInitialData?: T) => {
    setFormData(newInitialData || initialData);
    setErrors({});
    setIsSubmitting(false);
  }, [initialData]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const validateField = useCallback((
    field: keyof T,
    validator: (value: any) => string | null
  ): boolean => {
    const error = validator(formData[field]);
    if (error) {
      setErrors(prev => ({
        ...prev,
        [field]: error
      }));
      return false;
    }
    return true;
  }, [formData]);

  return {
    formData,
    isSubmitting,
    errors,
    updateField,
    updateMultipleFields,
    resetForm,
    setSubmitting: setIsSubmitting,
    setErrors,
    clearErrors,
    validateField
  };
}

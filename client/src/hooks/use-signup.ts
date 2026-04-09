/**
 * Custom hook for signup functionality
 * Manages form state, validation, and user registration flow
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useLocation } from 'wouter';
import { validateEmail } from '@/utils/validation-helpers';

interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface SignupValidation {
  email?: string;
  password?: string;
  confirmPassword?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  general?: string;
}

export function useSignup() {
  const [formData, setFormData] = useState<SignupFormData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: ''
  });
  const [errors, setErrors] = useState<SignupValidation>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const validateForm = useCallback((data: SignupFormData): SignupValidation => {
    const newErrors: SignupValidation = {};

    // Email validation
    const emailValidation = validateEmail(data.email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.errors[0];
    }

    // First name validation
    if (!data.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    // Last name validation
    if (!data.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    // Role validation
    if (!data.role) {
      newErrors.role = 'Please select an account type';
    }

    // Password validation
    if (!data.password.trim()) {
      newErrors.password = 'Password is required';
    } else if (data.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    // Confirm password validation
    if (!data.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (data.password !== data.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    return newErrors;
  }, []);

  const updateField = useCallback((field: keyof SignupFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear field-specific error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Clear confirm password error when password changes
    if (field === 'password' && errors.confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: undefined }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    // Validate form
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      // Create user account
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password, // This will be hashed on the server
          firstName: formData.firstName,
          lastName: formData.lastName,
          role: formData.role
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Signup failed');
      }

      // Auto-login after successful signup
      await login(formData.email, formData.password);
      setLocation('/'); // Redirect to dashboard after successful signup
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, login, setLocation, validateForm]);

  const resetForm = useCallback(() => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      role: ''
    });
    setErrors({});
    setIsSubmitting(false);
  }, []);

  return {
    // Form state
    formData,
    errors,
    isSubmitting,

    // Form actions
    updateField,
    handleSubmit,
    resetForm,

    // Validation helpers
    isFormValid: Object.keys(errors).length === 0 &&
                 formData.email &&
                 formData.password &&
                 formData.confirmPassword &&
                 formData.firstName &&
                 formData.lastName &&
                 formData.role
  };
}

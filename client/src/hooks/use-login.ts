/**
 * Custom hook for login functionality
 * Manages form state, validation, and authentication flow
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useLocation } from 'wouter';
import { validateEmail } from '@/utils/validation-helpers';

interface LoginFormData {
  email: string;
  password: string;
}

interface LoginValidation {
  email?: string;
  password?: string;
  general?: string;
  activationRequired?: boolean;
  emailVerificationRequired?: boolean;
}

export function useLogin() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<LoginValidation>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const validateForm = useCallback((data: LoginFormData): LoginValidation => {
    const newErrors: LoginValidation = {};

    // Email validation
    const emailValidation = validateEmail(data.email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.errors[0];
    }

    // Password validation
    if (!data.password.trim()) {
      newErrors.password = 'Password is required';
    }

    return newErrors;
  }, []);

  const updateField = useCallback((field: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear field-specific error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
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
      await login(formData.email, formData.password);
      setLocation('/'); // Redirect to dashboard after successful login
    } catch (error: any) {
      // Handle specific login errors with detailed messages for activation
      const errorMessage = error.message || 'Login failed. Please try again.';

      // Check for activation-specific errors
      if (error.code === 'ACCOUNT_NOT_ACTIVATED') {
        setErrors({
          general: `${errorMessage} Click here to resend activation email.`,
          activationRequired: true
        });
      } else if (error.code === 'EMAIL_NOT_VERIFIED') {
        setErrors({
          general: `${errorMessage} Please check your email to verify your account.`,
          emailVerificationRequired: true
        });
      } else {
        setErrors({ general: errorMessage });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, login, setLocation, validateForm]);

  const fillDemoCredentials = useCallback(async (role: 'admin' | 'analyst' | 'viewer' | 'marketing') => {
    // Check if demo mode is enabled via environment variable
    // In production, this should be set to 'false' or undefined
    const isDemoEnabled = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true' ||
                         import.meta.env.MODE === 'development';

    if (!isDemoEnabled) {
      setErrors({ general: 'Demo login is not available in this environment' });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Use secure server-side demo login endpoint
      const response = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Demo login successful, redirect to dashboard
        setLocation('/');
      } else {
        setErrors({ general: data.error || 'Demo login failed. Please try again.' });
      }
    } catch (error) {
      console.error('Demo login error:', error);
      setErrors({ general: 'Demo login service is temporarily unavailable.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [setLocation]);

  const resetForm = useCallback(() => {
    setFormData({ email: '', password: '' });
    setErrors({});
    setIsSubmitting(false);
  }, []);

  const handleResendActivation = useCallback(async () => {
    if (!formData.email) {
      setErrors({ general: 'Please enter your email address first.' });
      return;
    }

    try {
      const response = await fetch('/api/auth/resend-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: formData.email })
      });

      const data = await response.json();

      if (response.ok) {
        setErrors({
          general: data.message || 'If your email exists and is not activated, a new activation email has been sent.'
        });
      } else {
        setErrors({ general: data.error || 'Failed to resend activation email' });
      }
    } catch (error) {
      setErrors({ general: 'Network error. Please try again.' });
    }
  }, [formData.email]);

  return {
    // Form state
    formData,
    errors,
    isSubmitting,
    isLoading: isLoading || isSubmitting,

    // Form actions
    updateField,
    handleSubmit,
    fillDemoCredentials,
    resetForm,
    handleResendActivation,

    // Validation helpers
    isFormValid: Object.keys(errors).length === 0 && formData.email && formData.password
  };
}

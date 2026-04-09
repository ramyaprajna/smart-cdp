/**
 * Custom hook for segments management functionality
 * Manages segment CRUD operations, validation, and UI state
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSegment } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useModal } from '@/hooks/use-modal';
import { useFormState } from '@/hooks/use-form-state';
import { useSegments } from '@/hooks/use-segments';

interface SegmentFormData {
  name: string;
  description: string;
  criteria: object;
}

interface CriteriaRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface SegmentsManagementHookResult {
  // Data
  segments: any[];
  customerStats: any;

  // UI State
  isLoading: boolean;
  isCreateModalOpen: boolean;
  isEditModalOpen: boolean;
  editingSegment: any;

  // Form State
  formData: SegmentFormData;
  isSubmitting: boolean;
  errors: any;

  // Criteria Rules
  criteriaRules: CriteriaRule[];
  setCriteriaRules: (rules: CriteriaRule[]) => void;

  // Actions
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openEditModal: (segment: any) => void;
  closeEditModal: () => void;
  updateField: <K extends keyof SegmentFormData>(field: K, value: SegmentFormData[K]) => void;
  resetForm: () => void;
  handleCreateSubmit: (e: React.FormEvent) => void;
  handleEditSubmit: (e: React.FormEvent) => void;
  handleDeleteSegment: (segment: any) => void;

  // Criteria Builder
  addCriteriaRule: () => void;
  removeCriteriaRule: (id: string) => void;
  updateCriteriaRule: (id: string, field: keyof CriteriaRule, value: string) => void;
  buildCriteriaFromRules: () => object;

  // Validation
  validateForm: () => boolean;

  // Field Options
  fieldOptions: Array<{ value: string; label: string; category: string }>;
  operatorOptions: Record<string, Array<{ value: string; label: string }>>;
}

const INITIAL_FORM_DATA: SegmentFormData = {
  name: "",
  description: "",
  criteria: {},
};

const FIELD_OPTIONS = [
  // Demographics
  { value: 'gender', label: 'Gender', category: 'Demographics' },
  { value: 'dateOfBirth', label: 'Age/Date of Birth', category: 'Demographics' },
  { value: 'customerSegment', label: 'Customer Segment', category: 'Demographics' },

  // Location
  { value: 'currentAddress.city', label: 'City', category: 'Location' },
  { value: 'currentAddress.province', label: 'Province', category: 'Location' },
  { value: 'currentAddress.country', label: 'Country', category: 'Location' },

  // Business Metrics
  { value: 'lifetimeValue', label: 'Lifetime Value', category: 'Business Metrics' },
  { value: 'dataQualityScore', label: 'Data Quality Score', category: 'Business Metrics' },
  { value: 'lastActiveAt', label: 'Last Active Date', category: 'Business Metrics' },

  // Professional Data
  { value: 'profession', label: 'Profession', category: 'Professional' },
  { value: 'industry', label: 'Industry', category: 'Professional' },
  { value: 'company', label: 'Company', category: 'Professional' },
];

const OPERATOR_OPTIONS = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'greaterThan', label: 'Greater than' },
    { value: 'lessThan', label: 'Less than' },
    { value: 'between', label: 'Between' },
  ],
  date: [
    { value: 'equals', label: 'On date' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between dates' },
  ],
  category: [
    { value: 'equals', label: 'Is' },
    { value: 'in', label: 'Is one of' },
    { value: 'notEquals', label: 'Is not' },
  ]
};

export function useSegmentsManagement(): SegmentsManagementHookResult {
  const { segments, isLoading, customerStats } = useSegments();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Modal states
  const {
    isOpen: isCreateModalOpen,
    openCreateModal,
    closeModal: closeCreateModal
  } = useModal();

  const {
    isOpen: isEditModalOpen,
    selectedItem: editingSegment,
    openEditModal,
    closeModal: closeEditModal
  } = useModal<any>();

  // Form state
  const {
    formData,
    isSubmitting,
    errors,
    updateField,
    resetForm,
    setSubmitting,
    setErrors
  } = useFormState<SegmentFormData>(INITIAL_FORM_DATA);

  // Criteria rules state
  const [criteriaRules, setCriteriaRules] = useState<CriteriaRule[]>([]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      toast({ title: "Segment created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      closeCreateModal();
      resetForm();
      setCriteriaRules([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create segment",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Criteria builder functions
  const addCriteriaRule = useCallback(() => {
    const newRule: CriteriaRule = {
      id: `rule_${Date.now()}`,
      field: '',
      operator: '',
      value: ''
    };
    setCriteriaRules(prev => [...prev, newRule]);
  }, []);

  const removeCriteriaRule = useCallback((id: string) => {
    setCriteriaRules(prev => prev.filter(rule => rule.id !== id));
  }, []);

  const updateCriteriaRule = useCallback((id: string, field: keyof CriteriaRule, value: string) => {
    setCriteriaRules(prev => prev.map(rule =>
      rule.id === id ? { ...rule, [field]: value } : rule
    ));
  }, []);

  const buildCriteriaFromRules = useCallback(() => {
    if (criteriaRules.length === 0) return {};

    const conditions = criteriaRules
      .filter(rule => rule.field && rule.operator && rule.value)
      .map(rule => ({
        field: rule.field,
        operator: rule.operator,
        value: rule.value
      }));

    return { conditions };
  }, [criteriaRules]);

  // Form validation
  const validateForm = useCallback(() => {
    const newErrors: any = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Segment name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (criteriaRules.length === 0) {
      newErrors.criteria = 'At least one criteria rule is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, criteriaRules, setErrors]);

  // Submit handlers
  const handleCreateSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    const criteria = buildCriteriaFromRules();
    createMutation.mutate({
      ...formData,
      criteria
    });
  }, [formData, validateForm, buildCriteriaFromRules, createMutation]);

  const handleEditSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // Implementation for edit functionality
  }, []);

  const handleDeleteSegment = useCallback((segment: any) => {
    // Implementation for delete functionality
  }, []);

  return {
    // Data
    segments,
    customerStats,

    // UI State
    isLoading,
    isCreateModalOpen,
    isEditModalOpen,
    editingSegment,

    // Form State
    formData,
    isSubmitting: isSubmitting || createMutation.isPending,
    errors,

    // Criteria Rules
    criteriaRules,
    setCriteriaRules,

    // Actions
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
    updateField,
    resetForm,
    handleCreateSubmit,
    handleEditSubmit,
    handleDeleteSegment,

    // Criteria Builder
    addCriteriaRule,
    removeCriteriaRule,
    updateCriteriaRule,
    buildCriteriaFromRules,

    // Validation
    validateForm,

    // Field Options
    fieldOptions: FIELD_OPTIONS,
    operatorOptions: OPERATOR_OPTIONS
  };
}

/**
 * Custom hook for managing import-related modal states
 * Centralizes modal visibility and data management
 */

import { useState } from 'react';
import type { AIColumnMappingResult } from '@/hooks/use-ai-column-mapping';

export interface ImportModalState {
  showAIMapping: boolean;
  showBulkAI: boolean;
  showMappingReview: boolean;
  showDuplicateModal: boolean;
}

export interface ImportModalData {
  aiMappingResult: AIColumnMappingResult | null;
  aiFieldMappings: Record<string, string>;
  duplicateAnalysisData: any;
  duplicateHandlingOptions: any;
}

export const useImportModals = () => {
  // Modal visibility state
  const [modalState, setModalState] = useState<ImportModalState>({
    showAIMapping: false,
    showBulkAI: false,
    showMappingReview: false,
    showDuplicateModal: false
  });

  // Modal data state
  const [modalData, setModalData] = useState<ImportModalData>({
    aiMappingResult: null,
    aiFieldMappings: {},
    duplicateAnalysisData: null,
    duplicateHandlingOptions: null
  });

  // Modal control functions
  const openAIMapping = () => {
    setModalState(prev => ({ ...prev, showAIMapping: true }));
  };

  const closeAIMapping = () => {
    setModalState(prev => ({ ...prev, showAIMapping: false }));
  };

  const openBulkAI = () => {
    setModalState(prev => ({ ...prev, showBulkAI: true }));
  };

  const closeBulkAI = () => {
    setModalState(prev => ({ ...prev, showBulkAI: false }));
  };

  const openMappingReview = () => {
    setModalState(prev => ({ ...prev, showMappingReview: true }));
  };

  const closeMappingReview = () => {
    setModalState(prev => ({ ...prev, showMappingReview: false }));
  };

  const openDuplicateModal = (analysisData: any) => {
    setModalData(prev => ({ ...prev, duplicateAnalysisData: analysisData }));
    setModalState(prev => ({ ...prev, showDuplicateModal: true }));
  };

  const closeDuplicateModal = () => {
    setModalState(prev => ({ ...prev, showDuplicateModal: false }));
    setModalData(prev => ({
      ...prev,
      duplicateAnalysisData: null,
      duplicateHandlingOptions: null
    }));
  };

  // Data setters
  const setAIMappingResult = (result: AIColumnMappingResult | null) => {
    setModalData(prev => ({ ...prev, aiMappingResult: result }));
  };

  const setAIFieldMappings = (mappings: Record<string, string>) => {
    setModalData(prev => ({ ...prev, aiFieldMappings: mappings }));
  };

  const setDuplicateHandlingOptions = (options: any) => {
    setModalData(prev => ({ ...prev, duplicateHandlingOptions: options }));
  };

  // Reset all modal state
  const resetModalState = () => {
    setModalState({
      showAIMapping: false,
      showBulkAI: false,
      showMappingReview: false,
      showDuplicateModal: false
    });
    setModalData({
      aiMappingResult: null,
      aiFieldMappings: {},
      duplicateAnalysisData: null,
      duplicateHandlingOptions: null
    });
  };

  return {
    // State
    modalState,
    modalData,

    // AI Mapping Modal
    openAIMapping,
    closeAIMapping,

    // Bulk AI Modal
    openBulkAI,
    closeBulkAI,

    // Mapping Review Modal
    openMappingReview,
    closeMappingReview,

    // Duplicate Modal
    openDuplicateModal,
    closeDuplicateModal,

    // Data setters
    setAIMappingResult,
    setAIFieldMappings,
    setDuplicateHandlingOptions,

    // Reset
    resetModalState
  };
};

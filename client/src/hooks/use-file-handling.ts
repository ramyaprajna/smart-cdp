/**
 * Custom hook for file handling operations
 * Manages file selection, validation, drag & drop, and sample downloads
 */

import { useState, useCallback, useRef } from 'react';
import { analyzeFileSize } from '@/constants/file-limits';
import { useImportErrorHandler } from '@/utils/import-error-handling';

const SUPPORTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

export const useFileHandling = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { handleError, showSuccessMessage, showWarningMessage } = useImportErrorHandler();

  // File validation
  const validateFile = useCallback((file: File): string | null => {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type}. Please use Excel, CSV, DOCX, or TXT files.`;
    }

    const fileAnalysis = analyzeFileSize(file.size);

    if (fileAnalysis.exceedsLimit) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 100MB.`;
    }

    // Show warnings for large files but don't block them
    if (fileAnalysis.warningMessage) {
      showWarningMessage("Large File Warning", fileAnalysis.warningMessage);
    }

    return null;
  }, [showWarningMessage]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      handleError({
        code: 'FILE_VALIDATION',
        message: validationError
      }, 'File Selection');
      return false;
    }

    setSelectedFile(file);
    return true;
  }, [validateFile, handleError]);

  // Drag & drop handlers
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragActive(false);
  }, []);

  // Sample file download
  const downloadSample = useCallback(() => {
    const sampleData = `firstName,lastName,email,phoneNumber,dateOfBirth,gender,currentAddress,customerSegment
John,Doe,john.doe@example.com,+62812345678,1990-01-15,Male,"{""city"":""Jakarta"",""address"":""Jl. Sudirman No. 1""}",Professional
Jane,Smith,jane.smith@example.com,+62887654321,1985-05-20,Female,"{""city"":""Bandung"",""address"":""Jl. Asia Afrika No. 10""}",Student`;

    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-customer-data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showSuccessMessage("Sample downloaded", "CSV sample file has been downloaded successfully");
  }, [showSuccessMessage]);

  // Reset file state
  const resetFile = useCallback(() => {
    setSelectedFile(null);
    setIsDragActive(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return {
    // State
    selectedFile,
    isDragActive,
    fileInputRef,

    // Actions
    handleFileSelect,
    handleFileDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    downloadSample,
    resetFile,
    validateFile
  };
};

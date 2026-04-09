/**
 * Import Step Renderer Component
 * Handles rendering of different import steps based on current state
 */

import { memo } from "react";
import { FileSelectionStep } from "./steps/file-selection-step";
import { PreviewStep } from "./steps/preview-step";
import { ImportStep } from "./steps/import-step";
import { ProcessingStep } from "./steps/processing-step";
import { CompleteStep } from "./steps/complete-step";
import type { ImportStep as StepType, useRefactoredDataImport } from "@/hooks/use-refactored-data-import";

interface ImportStepRendererProps {
  currentStep: StepType;
  importHook: ReturnType<typeof useRefactoredDataImport>;
  duplicateAnalyzing?: boolean;
  mappingAnalyzing?: boolean;
}

export const ImportStepRenderer = memo<ImportStepRendererProps>(function ImportStepRenderer({
  currentStep,
  importHook,
  duplicateAnalyzing = false,
  mappingAnalyzing = false
}) {
  const {
    selectedFile,
    previewData,
    importResult,
    importProgress,
    isDragActive,
    isProcessing,
    fileInputRef,
    handleFileSelect,
    handleFileDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    generatePreview,
    proceedToImport,
    resumeImport,
    resetImport,
    openAIMapping,
    openBulkAI
  } = importHook;

  switch (currentStep) {
    case 'select':
      return (
        <FileSelectionStep
          selectedFile={selectedFile}
          previewData={previewData}
          isDragActive={isDragActive}
          isProcessing={isProcessing}
          fileInputRef={fileInputRef}
          onFileSelect={handleFileSelect}
          onFileDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onGeneratePreview={generatePreview}
          onOpenAIMapping={openAIMapping}
          onOpenBulkAI={openBulkAI}
        />
      );

    case 'preview':
      if (!previewData) return null;
      return (
        <PreviewStep
          previewData={previewData}
          isProcessing={isProcessing}
          isAnalyzing={mappingAnalyzing}
          onProceedToImport={proceedToImport}
          onOpenAIMapping={openAIMapping}
          onCancel={resetImport}
        />
      );

    case 'import':
      return (
        <ImportStep
          selectedFile={selectedFile}
          previewData={previewData}
          isProcessing={isProcessing}
          isDuplicateAnalyzing={duplicateAnalyzing}
          onProceedToImport={proceedToImport}
          onCancel={resetImport}
        />
      );

    case 'processing':
      if (!importProgress) return null;
      return (
        <ProcessingStep
          importProgress={importProgress}
          onResume={resumeImport}
          onCancel={resetImport}
        />
      );

    case 'complete':
      if (!importResult) return null;
      return (
        <CompleteStep
          importResult={importResult}
          onStartNewImport={resetImport}
        />
      );

    default:
      return null;
  }
});
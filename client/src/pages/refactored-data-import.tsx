/**
 * Refactored Data Import Page
 * Clean, modular implementation using focused components and hooks
 */

import { memo, useState } from "react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, FileText, CheckCircle, Brain } from "lucide-react";
import { useRefactoredDataImport } from "@/hooks/use-refactored-data-import";
import { ImportStepRenderer } from "@/components/import/import-step-renderer";
import { AIMappingModal } from "@/components/import/modals/ai-mapping-modal";
import { BulkAIModal } from "@/components/import/modals/bulk-ai-modal";
import { MappingReviewModal } from "@/components/mapping-review-modal";
import { DuplicateConfirmationModal } from "@/components/import/duplicate-confirmation-modal";
import { useMappingReview } from "@/hooks/use-mapping-review";
import { useImportErrorHandler } from "@/utils/import-error-handling";
import type { DuplicateHandlingOptions } from "@/hooks/use-duplicate-detection";
import type { AIColumnMappingResult } from "@/hooks/use-ai-column-mapping";
import type { MappingDecision } from "@/components/mapping-review-modal";

interface ResolutionSummary {
  recordsProcessed: number;
  recordsSkipped: number;
  recordsUpdated: number;
  recordsCreated: number;
  errors: number;
}

const RefactoredDataImport = memo(function RefactoredDataImport() {
  const importHook = useRefactoredDataImport();
  const { handleError, showSuccessMessage } = useImportErrorHandler();
  const [resolutionSummary, setResolutionSummary] = useState<ResolutionSummary | null>(null);
  const [confirmedOptions, setConfirmedOptions] = useState<DuplicateHandlingOptions | null>(null);

  // Mapping Review Integration
  const {
    analyzeFile,
    approveMapping,
    reviewData,
    isAnalyzing: isMappingAnalyzing,
    isApproving,
    resetReview
  } = useMappingReview();

  // AI Mapping Handlers
  const handleAIMappingComplete = (mappings: Record<string, string>, analysis: AIColumnMappingResult) => {
    importHook.setAIFieldMappings(mappings);
    importHook.setAIMappingResult(analysis);
    importHook.closeAIMapping();
  };

  const handleAIMappingError = (error: string) => {
    handleError(error, 'AI Mapping');
  };

  const handleBulkAIMappingComplete = (mappings: Record<string, string>) => {
    importHook.setAIFieldMappings(mappings);
  };

  const handleDuplicateConfirm = async (options: DuplicateHandlingOptions) => {
    importHook.setDuplicateHandlingOptions(options);
    setConfirmedOptions(options);

    const analysisId = importHook.lastAnalysisId;
    if (analysisId) {
      try {
        const importId = crypto.randomUUID();
        const result = await importHook.handleDuplicates(importId, options, analysisId);
        const summary: ResolutionSummary = result?.summary || {
          recordsProcessed: result?.processingResult?.recordsProcessed || 0,
          recordsSkipped: result?.processingResult?.recordsSkipped || 0,
          recordsUpdated: result?.processingResult?.recordsUpdated || 0,
          recordsCreated: result?.processingResult?.recordsSuccessful || 0,
          errors: result?.processingResult?.errors?.length || 0
        };
        setResolutionSummary(summary);
        if (summary.errors === 0) {
          showSuccessMessage(
            "Duplicates resolved",
            `${summary.recordsProcessed} duplicate(s) processed: ${summary.recordsSkipped} skipped, ${summary.recordsUpdated} updated, ${summary.recordsCreated} created.`
          );
        }
      } catch (err) {
        handleError('Failed to resolve duplicates via handle API. Proceeding with import pipeline.', 'Duplicate Handling');
        setResolutionSummary(null);
        importHook.closeDuplicateModal();
        importHook.confirmImport(options);
      }
    } else {
      importHook.closeDuplicateModal();
      importHook.confirmImport(options);
    }
  };

  const handleDuplicateModalClose = () => {
    const opts = confirmedOptions;
    const hadResolution = !!resolutionSummary;
    const wasFullyResolved = resolutionSummary && resolutionSummary.errors === 0;
    setResolutionSummary(null);
    setConfirmedOptions(null);
    importHook.closeDuplicateModal();
    if (hadResolution && opts) {
      if (wasFullyResolved) {
        importHook.confirmImport({ ...opts, duplicatesPreHandled: true });
      } else {
        importHook.confirmImport(opts);
      }
    }
  };

  const handleDuplicateCancel = () => {
    setResolutionSummary(null);
    setConfirmedOptions(null);
    importHook.closeDuplicateModal();
    showSuccessMessage("Import cancelled", "Import was cancelled due to duplicate concerns.");
  };

  // Mapping Review Handlers
  const handleMappingApproval = async (decisions: MappingDecision[], autoApprove = false) => {
    const success = await approveMapping(decisions, autoApprove);

    if (success) {
      importHook.closeMappingReview();
      importHook.proceedToImport();
    }
  };

  const handleMappingReviewCancel = () => {
    importHook.closeMappingReview();
    resetReview();
  };

  return (
    <>
      <Header
        title="Data Import - Refactored"
        subtitle="Enhanced file processing with improved architecture and maintainability"
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Import Interface */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="w-5 h-5" />
                <span>Import Customer Data</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImportStepRenderer
                currentStep={importHook.currentStep}
                importHook={importHook}
                duplicateAnalyzing={importHook.isDuplicateAnalyzing}
                mappingAnalyzing={isMappingAnalyzing}
              />
            </CardContent>
          </Card>

          {/* Feature Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Enhanced Import Features</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Refactoring Improvements</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Modular component architecture</li>
                  <li>• Focused custom hooks for specific concerns</li>
                  <li>• Centralized error handling and notifications</li>
                  <li>• Reusable modal wrapper components</li>
                  <li>• Improved state management</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">Supported File Formats</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Excel (.xlsx, .xls) - Up to 100MB</li>
                  <li>• CSV (.csv) - Comma or semicolon separated</li>
                  <li>• Word Documents (.docx) - Structured text</li>
                  <li>• Text Files (.txt) - Various formats</li>
                  <li>• JSON (.json) - Structured data objects</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={importHook.downloadSample}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Sample File
                </Button>
                <Button
                  onClick={importHook.openBulkAI}
                  variant="outline"
                  className="w-full"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Try Bulk AI Demo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Implementation Status */}
        <Card>
          <CardHeader>
            <CardTitle>Refactoring Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
                <h4 className="font-medium text-success">Component Decomposition</h4>
                <p className="text-sm text-muted-foreground">Step-based components for better organization</p>
              </div>
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
                <h4 className="font-medium text-success">Custom Hooks</h4>
                <p className="text-sm text-muted-foreground">Focused hooks for specific concerns</p>
              </div>
              <div className="text-center p-4 bg-success/10 rounded-lg">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
                <h4 className="font-medium text-success">Error Handling</h4>
                <p className="text-sm text-muted-foreground">Centralized error handling utilities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Mapping Result Summary */}
        {importHook.modalData.aiMappingResult && Object.keys(importHook.modalData.aiFieldMappings).length > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <Brain className="h-5 w-5" />
                AI Mapping Applied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium text-green-700">Mapped Fields</div>
                  <div className="text-green-600">{Object.keys(importHook.modalData.aiFieldMappings).length}</div>
                </div>
                <div>
                  <div className="font-medium text-green-700">Confidence</div>
                  <div className="text-green-600">{importHook.modalData.aiMappingResult.overallConfidence}%</div>
                </div>
                <div>
                  <div className="font-medium text-green-700">Accuracy</div>
                  <div className="text-green-600">{importHook.modalData.aiMappingResult.estimatedAccuracy}%</div>
                </div>
                <div>
                  <div className="font-medium text-green-700">Status</div>
                  <div className="text-green-600">Ready for Import</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Mapping Modal */}
        {importHook.selectedFile && (
          <AIMappingModal
            isOpen={importHook.modalState.showAIMapping}
            onClose={importHook.closeAIMapping}
            selectedFile={importHook.selectedFile}
            onMappingComplete={handleAIMappingComplete}
            onError={handleAIMappingError}
          />
        )}

        {/* Bulk AI Modal */}
        <BulkAIModal
          isOpen={importHook.modalState.showBulkAI}
          onClose={importHook.closeBulkAI}
          onMappingComplete={handleBulkAIMappingComplete}
          onError={handleAIMappingError}
        />

        {/* Mapping Review Modal */}
        {reviewData && (
          <MappingReviewModal
            isOpen={importHook.modalState.showMappingReview}
            onClose={handleMappingReviewCancel}
            reviewData={reviewData}
            onApprove={handleMappingApproval}
            isProcessing={isApproving}
          />
        )}

        {importHook.modalData.duplicateAnalysisData && importHook.selectedFile && (
          <DuplicateConfirmationModal
            isOpen={importHook.modalState.showDuplicateModal}
            onClose={handleDuplicateModalClose}
            duplicateAnalysis={importHook.modalData.duplicateAnalysisData}
            fileName={importHook.selectedFile.name}
            onConfirm={handleDuplicateConfirm}
            onCancel={handleDuplicateCancel}
            isLoading={importHook.isDuplicateHandling}
            resolutionSummary={resolutionSummary}
          />
        )}
      </main>
    </>
  );
});

export default RefactoredDataImport;

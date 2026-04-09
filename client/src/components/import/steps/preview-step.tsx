/**
 * Preview Step Component
 * Displays data preview and allows proceeding to import
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Shield } from "lucide-react";
import DataPreview from "@/components/import/data-preview";
import type { PreviewData } from "@/hooks/use-data-import";

interface PreviewStepProps {
  previewData: PreviewData;
  isProcessing: boolean;
  isAnalyzing: boolean;
  onProceedToImport: () => void;
  onOpenAIMapping: () => void;
  onCancel: () => void;
}

export const PreviewStep = memo<PreviewStepProps>(function PreviewStep({
  previewData,
  isProcessing,
  isAnalyzing,
  onProceedToImport,
  onOpenAIMapping,
  onCancel
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Data Preview</h3>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onOpenAIMapping}
            disabled={isProcessing}
          >
            <Brain className="w-4 h-4 mr-2" />
            AI Mapping
          </Button>
          <Button
            onClick={onProceedToImport}
            disabled={isProcessing || isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing mappings...
              </>
            ) : isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Check Duplicates & Import
              </>
            )}
          </Button>
        </div>
      </div>

      <DataPreview
        previewData={previewData}
        onProceed={onProceedToImport}
        onCancel={onCancel}
        isProcessing={isProcessing || isAnalyzing}
      />
    </div>
  );
});

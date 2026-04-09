/**
 * Import Step Component
 * Handles the import confirmation and ready state
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import type { PreviewData } from "@/hooks/use-data-import";

interface ImportStepProps {
  selectedFile: File | null;
  previewData: PreviewData | null;
  isProcessing: boolean;
  isDuplicateAnalyzing: boolean;
  onProceedToImport: () => void;
  onCancel: () => void;
}

export const ImportStep = memo<ImportStepProps>(function ImportStep({
  selectedFile,
  previewData,
  isProcessing,
  isDuplicateAnalyzing,
  onProceedToImport,
  onCancel
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Ready to Import</h3>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onProceedToImport}
            disabled={isProcessing || isDuplicateAnalyzing}
            className="min-w-32"
          >
            {isProcessing || isDuplicateAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isDuplicateAnalyzing ? 'Checking Duplicates...' : 'Importing...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Import Data
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground mb-2">
          All field mappings have been reviewed and approved.
          Click "Import Data" to begin processing with real-time progress tracking.
        </p>
        {previewData && (
          <div className="text-xs text-muted-foreground">
            File: {selectedFile?.name} • {previewData.metadata.totalRows} rows
          </div>
        )}
      </div>
    </div>
  );
});

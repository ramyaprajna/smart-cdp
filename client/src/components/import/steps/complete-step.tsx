/**
 * Complete Step Component
 * Shows import results and allows starting a new import
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, RefreshCw } from "lucide-react";
import { SchemaFeedback } from "@/components/import/schema-feedback";
import ImportSuccessWithErrors from "@/components/import/import-success-with-errors";
import type { ImportStats } from "@/hooks/use-data-import";

interface CompleteStepProps {
  importResult: ImportStats;
  onStartNewImport: () => void;
}

export const CompleteStep = memo<CompleteStepProps>(function CompleteStep({
  importResult,
  onStartNewImport
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <CheckCircle className="w-5 h-5 text-success" />
        <h3 className="text-lg font-medium">Import Complete</h3>
      </div>

      <SchemaFeedback
        schemaValidation={importResult.schemaValidation}
        mappingFeedback={importResult.mappingFeedback}
      />

      <ImportSuccessWithErrors importResult={importResult} />

      <div className="flex justify-center">
        <Button variant="outline" onClick={onStartNewImport}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Import Another File
        </Button>
      </div>
    </div>
  );
});

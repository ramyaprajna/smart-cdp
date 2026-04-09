/**
 * Processing Step Component
 * Shows real-time import progress and statistics
 */

import { memo } from "react";
import { Activity } from "lucide-react";
import ProgressTracker from "@/components/import/progress-tracker";
import type { ImportProgress, ResumeOptions } from "@/hooks/use-data-import";

interface ProcessingStepProps {
  importProgress: ImportProgress;
  onResume?: (options: ResumeOptions) => void;
  onCancel: () => void;
}

export const ProcessingStep = memo<ProcessingStepProps>(function ProcessingStep({
  importProgress,
  onResume,
  onCancel
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
        <h3 className="text-lg font-medium">Import in Progress</h3>
      </div>

      {/* Import Progress Tracker */}
      <ProgressTracker
        progress={importProgress}
        onResume={onResume || ((options) => {

        })}
        onCancel={onCancel}
      />

      {/* Real-time Status Updates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <div className="font-medium text-blue-900 dark:text-blue-100">
            {importProgress.processedRecords} / {importProgress.totalRecords}
          </div>
          <div className="text-blue-600 dark:text-blue-400">Records Processed</div>
        </div>
        <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
          <div className="font-medium text-green-900 dark:text-green-100">
            {importProgress.successfulRecords}
          </div>
          <div className="text-green-600 dark:text-green-400">Successful</div>
        </div>
        <div className="text-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
          <div className="font-medium text-orange-900 dark:text-orange-100">
            {importProgress.failedRecords}
          </div>
          <div className="text-orange-600 dark:text-orange-400">Failed</div>
        </div>
      </div>
    </div>
  );
});

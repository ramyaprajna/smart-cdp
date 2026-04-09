/**
 * Import Success with Errors Component
 *
 * Shows import completion status with direct link to error analysis
 * when imports have failed records.
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY
 */

import { memo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCheck,
  TrendingUp
} from "lucide-react";
import type { ImportStats } from "@/hooks/use-data-import";

interface ImportSuccessWithErrorsProps {
  importResult: ImportStats & {
    duplicateHandlingStrategy?: string;
    recordsSkipped?: number;
    recordsUpdated?: number;
    recordsMerged?: number;
    recordsCreated?: number;
  };
  className?: string;
}

const ImportSuccessWithErrors = memo<ImportSuccessWithErrorsProps>(function ImportSuccessWithErrors({
  importResult,
  className = ""
}) {
  const safeTotal = importResult.totalProcessed || 1; // Prevent division by zero
  const successRate = ((importResult.successful / safeTotal) * 100).toFixed(2);
  const errorRate = ((importResult.errors / safeTotal) * 100).toFixed(2);

  const getSeverityInfo = () => {
    const rate = parseFloat(errorRate);
    if (rate === 0) return { color: "green", severity: "Perfect", icon: CheckCircle2 };
    if (rate < 1) return { color: "blue", severity: "Excellent", icon: CheckCircle2 };
    if (rate < 5) return { color: "yellow", severity: "Good", icon: AlertTriangle };
    if (rate < 15) return { color: "orange", severity: "Needs Review", icon: AlertTriangle };
    return { color: "red", severity: "Critical", icon: AlertTriangle };
  };

  const severityInfo = getSeverityInfo();
  const SeverityIcon = severityInfo.icon;

  // Generate duplicate handling status message
  const getDuplicateStatusMessage = () => {
    const { duplicateHandlingStrategy, recordsSkipped, recordsUpdated, recordsMerged, recordsCreated, duplicates } = importResult;

    if (!duplicateHandlingStrategy || duplicates === 0) {
      return null;
    }

    switch (duplicateHandlingStrategy) {
      case 'skip_duplicates':
        return `Duplicates found – skipped importing ${(recordsSkipped || duplicates).toLocaleString()} records.`;
      case 'overwrite_existing':
        return `Updated ${(recordsUpdated || duplicates).toLocaleString()} existing customer records with new data.`;
      case 'merge_data':
        return `Merged ${(recordsMerged || duplicates).toLocaleString()} customer records with new incoming data.`;
      case 'create_new':
        return `Imported ${(recordsCreated || duplicates).toLocaleString()} new customer records, including duplicates.`;
      default:
        return `Processed ${duplicates.toLocaleString()} duplicate records.`;
    }
  };

  const duplicateStatusMessage = getDuplicateStatusMessage();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Duplicate Handling Status Message */}
      {duplicateStatusMessage && (
        <Alert className="border-blue-200 bg-blue-50">
          <FileCheck className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Duplicate Handling:</strong> {duplicateStatusMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Success Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-${severityInfo.color}-100 flex items-center justify-center`}>
                <SeverityIcon className={`h-5 w-5 text-${severityInfo.color}-600`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Import Completed</h3>
                <p className="text-sm text-muted-foreground">
                  {importResult.totalProcessed.toLocaleString()} records processed
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`bg-${severityInfo.color}-50 text-${severityInfo.color}-700 border-${severityInfo.color}-200`}
            >
              {severityInfo.severity}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-lg font-bold">{importResult.successful.toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground">Successful</p>
              <p className="text-xs font-medium text-green-600">{successRate}%</p>
            </div>

            {importResult.errors > 0 && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-red-600 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-lg font-bold">{importResult.errors.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xs font-medium text-red-600">{errorRate}%</p>
              </div>
            )}

            {importResult.duplicates > 0 && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                  <FileCheck className="h-4 w-4" />
                  <span className="text-lg font-bold">{importResult.duplicates.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
            )}

            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-lg font-bold">{successRate}%</span>
              </div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert with Navigation */}
      {importResult.errors > 0 && importResult.importSessionId && (
        <Alert className={`border-${severityInfo.color}-200 bg-${severityInfo.color}-50`}>
          <AlertTriangle className={`h-4 w-4 text-${severityInfo.color}-600`} />
          <AlertDescription className={`text-${severityInfo.color}-800`}>
            <div className="flex items-center justify-between">
              <div>
                <strong>{importResult.errors.toLocaleString()}</strong> records failed to import
                ({errorRate}% error rate).
                <br />
                <span className="text-sm">
                  Review detailed error information and retry failed records using our comprehensive error tracking system.
                </span>
              </div>
              <Link href={`/import-errors/${importResult.importSessionId}`}>
                <Button variant="outline" size="sm" className="ml-4 shrink-0">
                  <Eye className="h-4 w-4 mr-2" />
                  View Error Details
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Success Message for Perfect Imports */}
      {importResult.errors === 0 && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Perfect import!</strong> All {importResult.totalProcessed.toLocaleString()} records
            were successfully processed with no errors.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
});

export default ImportSuccessWithErrors;

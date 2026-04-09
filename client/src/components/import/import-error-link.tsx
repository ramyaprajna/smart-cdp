/**
 * Import Error Link Component
 *
 * Displays a link to view detailed error information when imports have failed records.
 * This component should be shown in import results or summaries.
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";
import { AlertTriangle, Eye, FileX } from "lucide-react";

interface ImportErrorLinkProps {
  importSessionId: string;
  errorCount: number;
  totalRecords: number;
  className?: string;
}

const ImportErrorLink = memo<ImportErrorLinkProps>(function ImportErrorLink({
  importSessionId,
  errorCount,
  totalRecords,
  className = ""
}) {
  const errorRate = (errorCount / totalRecords) * 100;
  const severityColor = errorRate > 10 ? "red" : errorRate > 1 ? "yellow" : "blue";

  if (errorCount === 0) {
    return null;
  }

  return (
    <Alert className={`border-${severityColor}-200 bg-${severityColor}-50 ${className}`}>
      <AlertTriangle className={`h-4 w-4 text-${severityColor}-600`} />
      <AlertDescription className={`text-${severityColor}-800`}>
        <div className="flex items-center justify-between">
          <div>
            <strong>{errorCount.toLocaleString()}</strong> records failed to import
            ({errorRate.toFixed(3)}% error rate).
            <br />
            View detailed error information and retry failed records.
          </div>
          <Link href={`/import-errors/${importSessionId}`}>
            <Button variant="outline" size="sm" className="ml-4">
              <Eye className="h-4 w-4 mr-2" />
              View Error Details
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
});

export default ImportErrorLink;

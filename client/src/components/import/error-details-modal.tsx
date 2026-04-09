/**
 * Error Details Modal Component
 *
 * Comprehensive interface for viewing failed record details in CDP imports.
 * Displays detailed error information including row number, field values,
 * error types, and suggested fixes for easy debugging and resolution.
 *
 * Features:
 * - Detailed error information display
 * - Original field values and error messages
 * - Suggested fixes and retry options
 * - Correlation ID tracking for debugging
 * - Export functionality for error analysis
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY for CDP error tracking
 */

import { memo, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  FileX,
  RotateCcw,
  Copy,
  Download,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ImportErrorDetail } from '@/types/import';

interface ErrorDetailsModalProps {
  errorDetail: ImportErrorDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: (errorDetail: ImportErrorDetail) => void;
  onMarkResolved?: (errorDetail: ImportErrorDetail) => void;
}

const ErrorDetailsModal = memo<ErrorDetailsModalProps>(function ErrorDetailsModal({
  errorDetail,
  isOpen,
  onClose,
  onRetry,
  onMarkResolved
}) {
  const { toast } = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const handleCopyCorrelationId = useCallback(() => {
    if (errorDetail?.correlationId) {
      navigator.clipboard.writeText(errorDetail.correlationId);
      toast({
        description: "Correlation ID copied to clipboard"
      });
    }
  }, [errorDetail?.correlationId, toast]);

  const handleExportError = useCallback(() => {
    if (!errorDetail) return;

    const exportData = {
      errorSummary: {
        rowNumber: errorDetail.sourceRowNumber,
        fileName: errorDetail.sourceFileName,
        errorType: errorDetail.errorType,
        timestamp: errorDetail.timestamp,
        correlationId: errorDetail.correlationId
      },
      errorDetails: {
        message: errorDetail.errorMessage,
        fieldErrors: errorDetail.fieldErrors,
        suggestedFix: errorDetail.suggestedFix,
        canRetry: errorDetail.canRetry
      },
      originalData: errorDetail.originalRowData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-row-${errorDetail.sourceRowNumber}-${errorDetail.correlationId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      description: "Error details exported successfully"
    });
  }, [errorDetail, toast]);

  const handleRetry = useCallback(async () => {
    if (!errorDetail || !onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry(errorDetail);
      toast({
        description: `Row ${errorDetail.sourceRowNumber} marked for retry`
      });
    } catch (error) {
      toast({
        title: "Retry failed",
        description: "Could not mark record for retry",
        variant: "destructive"
      });
    } finally {
      setIsRetrying(false);
    }
  }, [errorDetail, onRetry, toast]);

  const handleMarkResolved = useCallback(async () => {
    if (!errorDetail || !onMarkResolved) return;

    setIsResolving(true);
    try {
      await onMarkResolved(errorDetail);
      toast({
        description: `Row ${errorDetail.sourceRowNumber} marked as resolved`
      });
      onClose();
    } catch (error) {
      toast({
        title: "Resolution failed",
        description: "Could not mark record as resolved",
        variant: "destructive"
      });
    } finally {
      setIsResolving(false);
    }
  }, [errorDetail, onMarkResolved, toast, onClose]);

  const getErrorTypeIcon = (errorType: string) => {
    switch (errorType) {
      case 'INVALID_EMAIL':
      case 'INVALID_PHONE':
      case 'INVALID_DATE_FORMAT':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'MISSING_REQUIRED_FIELD':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'DUPLICATE_RECORD':
        return <XCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <FileX className="h-4 w-4 text-gray-500" />;
    }
  };

  const getErrorSeverityColor = (errorType: string, canRetry: boolean) => {
    if (canRetry) return "yellow";
    switch (errorType) {
      case 'MISSING_REQUIRED_FIELD':
        return "red";
      case 'DUPLICATE_RECORD':
        return "blue";
      default:
        return "gray";
    }
  };

  if (!errorDetail) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getErrorTypeIcon(errorDetail.errorType)}
            Import Error Details - Row {errorDetail.sourceRowNumber}
          </DialogTitle>
          <DialogDescription>
            Detailed information about the failed record from {errorDetail.sourceFileName}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">

            {/* Error Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  Error Summary
                  <Badge variant="outline" className={`bg-${getErrorSeverityColor(errorDetail.errorType, errorDetail.canRetry)}-50`}>
                    {errorDetail.errorType.replace(/_/g, ' ')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Row Number</p>
                    <p className="text-lg font-semibold">{errorDetail.sourceRowNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Error Time</p>
                    <p className="text-sm">{new Date(errorDetail.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Retry Status</p>
                    <div className="flex items-center gap-2">
                      {errorDetail.canRetry ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {errorDetail.canRetry ? 'Retryable' : 'Manual fix required'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Correlation ID</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">{errorDetail.correlationId}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyCorrelationId}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Error Message</p>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {errorDetail.errorMessage}
                    </AlertDescription>
                  </Alert>
                </div>

                {errorDetail.suggestedFix && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Suggested Fix</p>
                    <Alert className="border-blue-200 bg-blue-50">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800">
                        {errorDetail.suggestedFix}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Field Errors */}
            {Object.keys(errorDetail.fieldErrors).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Field-Specific Errors</CardTitle>
                  <CardDescription>
                    Detailed validation errors for individual fields
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Name</TableHead>
                        <TableHead>Original Value</TableHead>
                        <TableHead>Error Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(errorDetail.fieldErrors).map(([field, error]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{field}</TableCell>
                          <TableCell>
                            <code className="bg-muted px-2 py-1 rounded text-xs">
                              {String(errorDetail.originalRowData[field] || 'N/A')}
                            </code>
                          </TableCell>
                          <TableCell className="text-red-600">{error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Original Row Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Original Row Data</CardTitle>
                <CardDescription>
                  Complete field values from the source file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Data Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(errorDetail.originalRowData).map(([field, value]) => (
                      <TableRow key={field}>
                        <TableCell className="font-medium">{field}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-xs max-w-xs truncate inline-block">
                            {String(value || 'Empty')}
                          </code>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {typeof value}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportError}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export Details
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {errorDetail.canRetry && onRetry && (
              <Button
                variant="outline"
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2"
              >
                <RotateCcw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Marking for Retry...' : 'Mark for Retry'}
              </Button>
            )}

            {onMarkResolved && (
              <Button
                onClick={handleMarkResolved}
                disabled={isResolving}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isResolving ? 'Resolving...' : 'Mark as Resolved'}
              </Button>
            )}

            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default ErrorDetailsModal;

/**
 * Import Errors Page - Comprehensive Error Tracking Dashboard
 *
 * This page provides a complete interface for viewing and managing
 * failed records from data import operations. It demonstrates best
 * practices for CDP error tracking and debugging.
 *
 * Features:
 * - Import session overview with error statistics
 * - Failed records table with filtering and sorting
 * - Detailed error modal for individual record analysis
 * - Bulk operations for error resolution
 * - Export functionality for error analysis
 *
 * Created: July 23, 2025
 * Status: PRODUCTION-READY for CDP error tracking
 */

import { memo, useState, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  FileX,
  Eye,
  Download,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { useImportErrors } from "@/hooks/use-import-errors";
import type { ImportErrorDetail } from "@/types/import";
import ErrorDetailsModal from "@/components/import/error-details-modal";
import { useToast } from "@/hooks/use-toast";
import '../styles/scrollbar.css';

const ImportErrorsPage = memo(function ImportErrorsPage() {
  const { importId } = useParams<{ importId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // State management (hooks must be called before any returns)
  const [selectedError, setSelectedError] = useState<ImportErrorDetail | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [filterErrorType, setFilterErrorType] = useState<string>('');
  const [searchRowNumber, setSearchRowNumber] = useState<string>('');
  const [sortField, setSortField] = useState<'rowNumber' | 'errorType' | 'timestamp'>('rowNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Check if importId is valid UUID format
  const isValidUUID = importId && /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importId);

  // Hook for import error management (only call if valid UUID)
  const {
    failedRecords,
    errorSummary,
    importSession,
    isLoading,
    isLoadingSummary,
    getFailedRecord,
    markAsResolved,
    markForRetry,
    refreshErrors,
    getErrorTypeColor,
    getErrorSeverity
  } = useImportErrors({
    importSessionId: isValidUUID ? importId : undefined,
    errorType: filterErrorType === 'all' || !filterErrorType ? undefined : filterErrorType,
    limit: 100
  });

  // If importId is invalid, show error state (after all hooks)
  if (!importId || !isValidUUID) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Invalid Import ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              The import ID "{importId}" is not valid. Please check the URL and try again.
            </p>
            <Button onClick={() => setLocation('/import-history')}>
              Go to Import History
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filtered and sorted records
  const filteredRecords = useMemo(() => {
    let filtered = failedRecords;

    // Filter by row number search
    if (searchRowNumber) {
      const rowNum = parseInt(searchRowNumber);
      if (!isNaN(rowNum)) {
        filtered = filtered.filter(record =>
          record.sourceRowNumber === rowNum
        );
      }
    }

    // Sort records
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'rowNumber':
          aValue = a.sourceRowNumber;
          bValue = b.sourceRowNumber;
          break;
        case 'errorType':
          aValue = a.errorType;
          bValue = b.errorType;
          break;
        case 'timestamp':
          aValue = new Date(a.timestamp);
          bValue = new Date(b.timestamp);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [failedRecords, searchRowNumber, sortField, sortDirection]);

  // Handlers
  const handleViewError = useCallback(async (record: ImportErrorDetail) => {
    setSelectedError(record);
    setShowErrorModal(true);
  }, []);

  const handleGetSpecificError = useCallback(async (rowNumber: number) => {
    const errorDetail = await getFailedRecord(rowNumber);
    if (errorDetail) {
      setSelectedError(errorDetail);
      setShowErrorModal(true);
    } else {
      toast({
        title: "Record not found",
        description: `No failed record found for row ${rowNumber}`,
        variant: "destructive"
      });
    }
  }, [getFailedRecord, toast]);

  const handleMarkResolved = useCallback(async (errorDetail: ImportErrorDetail) => {
    await markAsResolved(errorDetail.sourceRowNumber, errorDetail.sourceFileName);
    refreshErrors();
  }, [markAsResolved, refreshErrors]);

  const handleMarkForRetry = useCallback(async (errorDetail: ImportErrorDetail) => {
    await markForRetry(errorDetail.sourceRowNumber, errorDetail.sourceFileName);
    refreshErrors();
  }, [markForRetry, refreshErrors]);

  const handleSort = useCallback((field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const handleExportErrors = useCallback(() => {
    const exportData = {
      importSession: {
        id: importSession?.id,
        fileName: importSession?.fileName,
        recordsProcessed: importSession?.recordsProcessed,
        recordsFailed: importSession?.recordsFailed,
        importedAt: importSession?.importedAt
      },
      errorSummary,
      failedRecords: filteredRecords.map(record => ({
        rowNumber: record.sourceRowNumber,
        errorType: record.errorType,
        errorMessage: record.errorMessage,
        fieldErrors: record.fieldErrors,
        originalData: record.originalRowData,
        suggestedFix: record.suggestedFix,
        canRetry: record.canRetry,
        timestamp: record.timestamp
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${importId?.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      description: "Error report exported successfully"
    });
  }, [importSession, errorSummary, filteredRecords, importId, toast]);

  if (!importId) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No import session specified. Please select an import session to view errors.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || isLoadingSummary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading error details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 space-y-6 custom-scrollbar" style={{ maxHeight: '100vh', overflowY: 'auto', paddingBottom: '2rem' }}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Error Analysis</h1>
          <p className="text-muted-foreground">
            Detailed error tracking and resolution for import session
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshErrors}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportErrors}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Import Session Overview */}
      {importSession && (
        <Card>
          <CardHeader>
            <CardTitle>Import Session Details</CardTitle>
            <CardDescription>
              {importSession.fileName} • {new Date(importSession.importedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Records</p>
                <p className="text-2xl font-bold">{importSession.recordsProcessed?.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Successful</p>
                <p className="text-2xl font-bold text-green-600">{importSession.recordsSuccessful?.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{importSession.recordsFailed?.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">
                  {((importSession.recordsSuccessful / importSession.recordsProcessed) * 100).toFixed(3)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Summary */}
      {errorSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Error Pattern Analysis</CardTitle>
            <CardDescription>
              Analysis of error types and affected fields
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Errors</p>
                <p className="text-xl font-bold">{errorSummary.totalErrors}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Retryable</p>
                <p className="text-xl font-bold text-yellow-600">{errorSummary.retryableErrors}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                <p className="text-xl font-bold text-red-600">{errorSummary.criticalErrors}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Row Range</p>
                <p className="text-xl font-bold">
                  {errorSummary.patternAnalysis.affectedRowRange.start}-{errorSummary.patternAnalysis.affectedRowRange.end}
                </p>
              </div>
            </div>

            {errorSummary.patternAnalysis.suggestedBulkFix && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Bulk Fix Suggestion:</strong> {errorSummary.patternAnalysis.suggestedBulkFix}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter Failed Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by row number..."
                value={searchRowNumber}
                onChange={(e) => setSearchRowNumber(e.target.value)}
                type="number"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={filterErrorType} onValueChange={setFilterErrorType}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by error type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Error Types</SelectItem>
                  <SelectItem value="INVALID_EMAIL">Invalid Email</SelectItem>
                  <SelectItem value="INVALID_PHONE">Invalid Phone</SelectItem>
                  <SelectItem value="MISSING_REQUIRED_FIELD">Missing Required Field</SelectItem>
                  <SelectItem value="DUPLICATE_RECORD">Duplicate Record</SelectItem>
                  <SelectItem value="INVALID_DATE_FORMAT">Invalid Date Format</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Failed Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Failed Records ({filteredRecords.length})</CardTitle>
          <CardDescription>
            Detailed information about each failed record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRecords.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Failed Records Found</h3>
              <p className="text-muted-foreground">
                {failedRecords.length === 0
                  ? "This import completed successfully with no errors."
                  : "No records match your current filter criteria."
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('rowNumber')}
                      className="h-auto p-0 font-semibold"
                    >
                      Row Number
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('errorType')}
                      className="h-auto p-0 font-semibold"
                    >
                      Error Type
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Error Message</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('timestamp')}
                      className="h-auto p-0 font-semibold"
                    >
                      Timestamp
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {record.sourceRowNumber}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`bg-${getErrorTypeColor(record.errorType)}-50 border-${getErrorTypeColor(record.errorType)}-200`}
                      >
                        {record.errorType.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {record.errorMessage}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {record.canRetry ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {getErrorSeverity(record)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(record.timestamp).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewError(record)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {record.canRetry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkForRetry(record)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Error Details Modal */}
      <ErrorDetailsModal
        errorDetail={selectedError}
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={handleMarkForRetry}
        onMarkResolved={handleMarkResolved}
      />
      </div>
    </div>
  );
});

export default ImportErrorsPage;

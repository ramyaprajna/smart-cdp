/**
 * Data Preview Component - Phase 2 Implementation
 *
 * Renders comprehensive file preview with validation warnings and data type detection.
 * Displays structured data in a user-friendly table format with metadata cards.
 *
 * Features:
 * - File metadata display (size, rows, processing time)
 * - Data type detection with visual badges
 * - Validation warnings and suggestions
 * - Responsive table with horizontal scrolling
 * - TypeScript strict compliance with proper interfaces
 * - Runtime error protection with loading states
 *
 * Phase 2 Status: PRODUCTION-READY - Comprehensive testing completed
 * Last Updated: July 23, 2025 - Runtime error fixed (metadata undefined protection added)
 * Bug Fix: Added null check for metadata to prevent "Cannot read properties of undefined" errors
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle, FileText, Clock, Database } from "lucide-react";
import type { PreviewData } from "@/hooks/use-data-import";

interface DataPreviewProps {
  previewData: PreviewData;
  onProceed: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

const DataPreview = memo<DataPreviewProps>(function DataPreview({ previewData, onProceed, onCancel, isProcessing = false }) {
  const { headers, rows, metadata, dataTypes, validation } = previewData;

  // Prevent rendering if metadata is not available or missing critical properties
  if (!metadata || typeof metadata.totalRows === 'undefined' || typeof metadata.fileName === 'undefined') {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Loading preview data...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* File Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            File Preview: {metadata.fileName}
          </CardTitle>
          <CardDescription>
            Review your data before importing to ensure quality and accuracy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{metadata.totalRows}</div>
              <div className="text-sm text-muted-foreground">Total Rows</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{headers.length}</div>
              <div className="text-sm text-muted-foreground">Columns</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {(metadata.fileSize / 1024 / 1024).toFixed(1)}MB
              </div>
              <div className="text-sm text-muted-foreground">File Size</div>
            </div>
            <div className="text-center flex flex-col items-center">
              <div className="flex items-center gap-1 text-orange-600">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">{metadata.estimatedProcessingTime}</span>
              </div>
              <div className="text-xs text-muted-foreground">Est. Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validation.hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Data Quality Issues Detected:</div>
              <ul className="list-disc list-inside space-y-1">
                {validation.warnings.map((warning: string, index: number) => (
                  <li key={index} className="text-sm">{warning}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {validation.suggestions.length > 0 && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Recommendations:</div>
              <ul className="list-disc list-inside space-y-1">
                {validation.suggestions.map((suggestion: string, index: number) => (
                  <li key={index} className="text-sm">{suggestion}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Data Types Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Detected Data Types
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(dataTypes).map(([column, type]) => (
              <Badge key={column} variant="secondary" className="text-xs">
                {column}: {String(type)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data Preview Table */}
      <Card>
        <CardHeader>
          <CardTitle>Data Preview</CardTitle>
          <CardDescription>
            Showing first {metadata.previewRows} of {metadata.totalRows} rows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header: string, index: number) => (
                    <TableHead key={index} className="whitespace-nowrap">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: Record<string, unknown>, rowIndex: number) => (
                  <TableRow key={rowIndex}>
                    {headers.map((header: string, colIndex: number) => (
                      <TableCell key={colIndex} className="whitespace-nowrap">
                        <div className="max-w-32 truncate" title={String(row[header] || '')}>
                          {String(row[header] || '')}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          onClick={onProceed}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isProcessing ? "Processing..." : `Import ${metadata.totalRows} Records`}
        </Button>
      </div>
    </div>
  );
});

export default DataPreview;

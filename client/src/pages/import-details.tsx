/**
 * Import Details Page Component
 *
 * Displays comprehensive details about a specific data import,
 * including duplicate detection logs, processing statistics,
 * and detailed information about what data was updated.
 *
 * Features:
 * - Import overview with statistics
 * - Duplicate detection logs and actions taken
 * - Detailed information about data changes for each strategy
 * - Processing timeline and performance metrics
 * - Error details and resolution suggestions
 */

import React from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Users, AlertCircle, CheckCircle, Clock, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface ImportDetailsData {
  import: {
    id: string;
    fileName: string;
    importedAt: string;
    importedBy: string;
    recordsProcessed: number;
    recordsSuccessful: number;
    recordsFailed: number;
    recordsDuplicates: number;
    duplicateHandlingStrategy: string;
    importStatus: string;
    fileSize: number;
    processingTime: number;
  };
  duplicateLogs?: Array<{
    id: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    action: string;
    matchReason: string;
    matchConfidence: number;
    rowNumber: number;
    dataChanges?: Record<string, { from: any; to: any }>;
    createdAt: string;
  }>;
  processingStats?: {
    totalDuplicatesFound: number;
    duplicatesSkipped: number;
    duplicatesUpdated: number;
    duplicatesCreated: number;
    averageProcessingTime: number;
  };
}

export default function ImportDetails() {
  const { importId } = useParams<{ importId: string }>();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<ImportDetailsData>({
    queryKey: ['import-details', importId],
    queryFn: async () => {
      const response = await fetch(`/api/data-lineage/${importId}/details`);
      if (!response.ok) {
        throw new Error('Failed to fetch import details');
      }
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading import details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Failed to load import details</p>
          <Button variant="outline" onClick={() => setLocation('/import-history')} className="mt-4">
            Back to Import History
          </Button>
        </div>
      </div>
    );
  }

  const { import: importData, duplicateLogs, processingStats } = data;

  const getDuplicateStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'skip_duplicates':
        return 'Duplicate records were skipped and not imported';
      case 'overwrite_existing':
        return 'Existing records were completely replaced with new data';
      case 'merge_data':
        return 'New data was merged with existing records, filling empty fields';
      case 'create_new':
        return 'New records were created despite being duplicates';
      default:
        return 'No duplicate handling strategy applied';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'overwritten':
      case 'merged':
        return <Database className="h-4 w-4 text-blue-600" />;
      case 'created_new':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionDescription = (action: string, dataChanges?: Record<string, { from: any; to: any }>) => {
    switch (action) {
      case 'skipped':
        return 'Record was skipped due to duplicate detection';
      case 'overwritten':
        return `Record was completely replaced. ${dataChanges ? Object.keys(dataChanges).length : 0} fields updated`;
      case 'merged':
        return `Data was merged with existing record. ${dataChanges ? Object.keys(dataChanges).length : 0} fields updated`;
      case 'created_new':
        return 'New record created despite being a duplicate';
      default:
        return 'Unknown action';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/import-history')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Import History
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Import Details</h1>
            <p className="text-muted-foreground">{importData.fileName}</p>
          </div>
        </div>
        <Badge variant={importData.importStatus === 'completed' ? 'default' : 'destructive'}>
          {importData.importStatus}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Import Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Import Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Imported By</p>
                <p className="font-medium">{importData.importedBy}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Import Date</p>
                <p className="font-medium">
                  {format(new Date(importData.importedAt), 'MMM dd, yyyy HH:mm')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">File Size</p>
                <p className="font-medium">{(importData.fileSize / 1024).toFixed(1)} KB</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Processing Time</p>
                <p className="font-medium">{importData.processingTime || 'N/A'}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Processing Statistics</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{importData.recordsProcessed}</p>
                <p className="text-sm text-muted-foreground">Total Processed</p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{importData.recordsSuccessful}</p>
                <p className="text-sm text-muted-foreground">Successful</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{importData.recordsDuplicates}</p>
                <p className="text-sm text-muted-foreground">Duplicates</p>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{importData.recordsFailed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Duplicate Handling Strategy */}
        {importData.duplicateHandlingStrategy && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>Duplicate Handling Strategy</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {importData.duplicateHandlingStrategy.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {getDuplicateStrategyDescription(importData.duplicateHandlingStrategy)}
                  </p>
                </div>

                {processingStats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-muted-foreground">Duplicates Found</p>
                      <p className="font-medium">{processingStats.totalDuplicatesFound}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Skipped</p>
                      <p className="font-medium">{processingStats.duplicatesSkipped}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Updated</p>
                      <p className="font-medium">{processingStats.duplicatesUpdated}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created New</p>
                      <p className="font-medium">{processingStats.duplicatesCreated}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Duplicate Processing Logs */}
        {duplicateLogs && duplicateLogs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>Duplicate Processing Logs</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Match Reason</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Data Changes</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicateLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.customerName}</p>
                            <p className="text-sm text-muted-foreground">{log.customerEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getActionIcon(log.action)}
                            <div>
                              <p className="font-medium capitalize">{log.action.replace('_', ' ')}</p>
                              <p className="text-xs text-muted-foreground">
                                {getActionDescription(log.action, log.dataChanges)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.matchReason}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${
                              log.matchConfidence >= 0.9 ? 'bg-green-500' :
                              log.matchConfidence >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            <span>{(log.matchConfidence * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.dataChanges && Object.keys(log.dataChanges).length > 0 ? (
                            <div className="space-y-1">
                              {Object.entries(log.dataChanges).slice(0, 3).map(([field, change]) => (
                                <div key={field} className="text-xs">
                                  <span className="font-medium">{field}:</span>
                                  <span className="text-muted-foreground ml-1">
                                    {String(change.from || 'empty')} → {String(change.to)}
                                  </span>
                                </div>
                              ))}
                              {Object.keys(log.dataChanges).length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{Object.keys(log.dataChanges).length - 3} more fields
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No changes</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">
                            {format(new Date(log.createdAt), 'HH:mm:ss')}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

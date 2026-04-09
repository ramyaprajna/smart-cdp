/**
 * NULL Record Diagnosis Component
 *
 * Provides comprehensive analysis and fixing tools for NULL records
 * in the customer database caused by failed header mapping.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, XCircle, Brain, Trash2, RotateCcw, FileText, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface NullRecordAnalysis {
  importId: string;
  totalRecords: number;
  completelyNullRecords: number;
  partiallyNullRecords: number;
  nullFields: string[];
  rootCause: string;
  hasRawData: boolean;
  fixable: boolean;
  recommendations: string[];
}

interface DiagnosisResult {
  success: boolean;
  importId: string;
  analysis: NullRecordAnalysis;
  diagnosis: {
    rootCause: string;
    severity: 'CRITICAL' | 'MODERATE';
    fixable: boolean;
    dataRecoverable: boolean;
  };
  solutions: {
    quickFixes: string[];
    comprehensiveSolution: string;
    sqlQueries: string[];
  };
  recommendations: string[];
}

interface ImportWithNulls {
  importId: string;
  fileName: string;
  importedAt: string;
  totalRecords: number;
  nullRecords: number;
}

export const NullRecordDiagnosis: React.FC = () => {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [importsWithNulls, setImportsWithNulls] = useState<ImportWithNulls[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImportId, setSelectedImportId] = useState<string>('');
  const { toast } = useToast();

  // Load imports with NULL records
  const loadImportsWithNulls = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/null-records/imports-with-nulls', {
        credentials: 'include'
      });
      const data = await response.json();
      setImportsWithNulls(data.importsWithNulls || []);

      // Auto-select the most problematic import
      if (data.importsWithNulls?.length > 0) {
        const mostAffected = data.importsWithNulls.reduce((max: ImportWithNulls, current: ImportWithNulls) =>
          current.nullRecords > max.nullRecords ? current : max, data.importsWithNulls[0]
        );
        setSelectedImportId(mostAffected.importId);
      }
    } catch (error) {
      toast({
        title: "Failed to Load Imports",
        description: "Could not retrieve imports with NULL records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Run comprehensive diagnosis
  const runDiagnosis = async (importId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/null-records/analyze/${importId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setDiagnosis(data);

      toast({
        title: "Diagnosis Complete",
        description: `Analyzed ${data.analysis?.totalRecords || 0} records`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Diagnosis Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Clean up NULL records
  const cleanupNullRecords = async (importId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/null-records/cleanup/${importId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      toast({
        title: data.success ? "Cleanup Successful" : "Cleanup Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });

      if (data.success) {
        // Refresh the analysis after cleanup
        await loadImportsWithNulls();
        setDiagnosis(null);
      }
    } catch (error) {
      toast({
        title: "Cleanup Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Initialize on component mount
  React.useEffect(() => {
    loadImportsWithNulls();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'MODERATE': return 'secondary';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="h-4 w-4" />;
      case 'MODERATE': return <AlertTriangle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">NULL Record Diagnosis</h2>
          <p className="text-muted-foreground">
            Analyze and fix NULL records caused by failed header mapping
          </p>
        </div>
        <Button onClick={loadImportsWithNulls} disabled={loading}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Import Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Imports with NULL Records
          </CardTitle>
          <CardDescription>
            Select an import to diagnose and fix NULL record issues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {importsWithNulls.map((imp) => (
              <div
                key={imp.importId}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedImportId === imp.importId
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedImportId(imp.importId)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{imp.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      Imported: {new Date(imp.importedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive" className="mb-1">
                      {imp.nullRecords.toLocaleString()} NULL
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      of {imp.totalRecords.toLocaleString()} total
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedImportId && (
            <div className="mt-4 pt-4 border-t">
              <Button
                onClick={() => runDiagnosis(selectedImportId)}
                disabled={loading}
                className="w-full"
              >
                <Brain className="mr-2 h-4 w-4" />
                Run Comprehensive Diagnosis
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnosis Results */}
      {diagnosis && (
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getSeverityIcon(diagnosis.diagnosis.severity)}
                Diagnosis Results
              </CardTitle>
              <CardDescription>
                Analysis for {diagnosis.analysis.totalRecords.toLocaleString()} records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">
                    {diagnosis.analysis.completelyNullRecords.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Completely NULL</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-500">
                    {diagnosis.analysis.partiallyNullRecords.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Partially NULL</p>
                </div>
                <div className="text-center">
                  <Badge variant={getSeverityColor(diagnosis.diagnosis.severity)}>
                    {diagnosis.diagnosis.severity}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">Severity</p>
                </div>
                <div className="text-center">
                  <Badge variant={diagnosis.diagnosis.fixable ? "default" : "destructive"}>
                    {diagnosis.diagnosis.fixable ? "FIXABLE" : "NOT FIXABLE"}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">Status</p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Root Cause</h4>
                <p className="text-sm text-muted-foreground">
                  {diagnosis.diagnosis.rootCause}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Affected Fields</h4>
                <div className="flex flex-wrap gap-2">
                  {diagnosis.analysis.nullFields.map((field) => (
                    <Badge key={field} variant="outline">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Solutions */}
          <Card>
            <CardHeader>
              <CardTitle>Recommended Solutions</CardTitle>
              <CardDescription>
                {diagnosis.solutions.comprehensiveSolution}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Quick Fixes</h4>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {diagnosis.solutions.quickFixes.map((fix, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{fix}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div>
                <h4 className="font-medium mb-2">Recommendations</h4>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {diagnosis.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Brain className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => cleanupNullRecords(diagnosis.importId)}
                  disabled={loading}
                  className="flex-1"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clean Up NULL Records
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({
                    title: "Re-import Guidance",
                    description: "Go to Import page and re-upload your Excel file. The new AI mapping will handle international headers correctly.",
                  })}
                  className="flex-1"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Re-import Guide
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

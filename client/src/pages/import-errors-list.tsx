/**
 * Import Errors List Page
 *
 * Lists all recent import sessions with error counts and provides
 * quick access to detailed error analysis for each session.
 *
 * Created: July 23, 2025
 * Updated: August 15, 2025 - Secure refresh system implementation
 * Status: PRODUCTION-READY with comprehensive secure refresh
 */

import { memo, useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  Eye,
  RefreshCw,
  Search,
  FileX,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import { useSecureRefresh } from "@/hooks/use-secure-refresh-fixed";
import { SecureRefreshButton } from "@/components/common/secure-refresh-button";
import { useToast } from "@/hooks/use-toast";
import '../styles/scrollbar.css';

interface ImportSession {
  id: string;
  fileName: string;
  fileSize: number;
  importType: string;
  importSource: string;
  recordsProcessed: number;
  recordsSuccessful: number;
  recordsFailed: number;
  importStatus: string;
  importedAt: Date;
  completedAt?: Date;
}

const ImportErrorsList = memo(function ImportErrorsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Fetch recent import sessions
  const {
    data: importSessions = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['/api/imports'],
    queryFn: async () => {
      const response = await fetch('/api/imports');
      if (!response.ok) {
        throw new Error('Failed to fetch import sessions');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : (data.imports || []);
    },
    staleTime: 30000, // 30 seconds
  });

  // Secure refresh implementation
  const handleSecureRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const {
    isRefreshing,
    refresh: executeSecureRefresh,
    error: refreshError
  } = useSecureRefresh(handleSecureRefresh, {
    onSuccess: () => {
      toast({
        title: "Refreshed Successfully",
        description: "Import errors data has been refreshed.",
      });
    },
    onError: (errorMessage) => {
      toast({
        title: "Refresh Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

  // Filter sessions with errors and apply search
  const filteredSessions = useMemo(() => {
    return importSessions
      .filter((session: ImportSession) => session.recordsFailed > 0)
      .filter((session: ImportSession) =>
        searchQuery === "" ||
        session.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a: ImportSession, b: ImportSession) =>
        new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
      );
  }, [importSessions, searchQuery]);

  const getStatusBadge = (session: ImportSession) => {
    const errorRate = (session.recordsFailed / session.recordsProcessed) * 100;

    if (session.importStatus === 'completed') {
      if (errorRate === 0) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Success</Badge>;
      if (errorRate < 5) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Minor Issues</Badge>;
      if (errorRate < 20) return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Issues</Badge>;
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Major Issues</Badge>;
    }

    if (session.importStatus === 'failed') {
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Failed</Badge>;
    }

    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Processing</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading import sessions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load import sessions. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 space-y-6 custom-scrollbar" style={{ maxHeight: '100vh', overflowY: 'auto', paddingBottom: '2rem' }}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Error Dashboard</h1>
          <p className="text-muted-foreground">
            Review and troubleshoot failed import records
          </p>
        </div>
        <SecureRefreshButton
          onClick={executeSecureRefresh}
          isRefreshing={isRefreshing}
          text={{
            idle: "Refresh",
            refreshing: "Refreshing..."
          }}
        />
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Import Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by file name or import ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {/* Import Sessions with Errors */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Imports with Errors ({filteredSessions.length})</CardTitle>
          <CardDescription>
            Import sessions that encountered errors during processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Import Errors Found</h3>
              <p className="text-muted-foreground">
                {importSessions.length === 0
                  ? "No import sessions found."
                  : searchQuery
                    ? "No import sessions match your search criteria."
                    : "All recent imports completed successfully!"
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Import Date</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Error Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((session: ImportSession) => {
                  const errorRate = ((session.recordsFailed / session.recordsProcessed) * 100).toFixed(2);

                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileX className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{session.fileName}</p>
                            <p className="text-xs text-muted-foreground">{session.importType.toUpperCase()}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {new Date(session.importedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>{session.recordsProcessed.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="font-medium text-red-600">
                          {session.recordsFailed.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          parseFloat(errorRate) > 10 ? 'text-red-600' :
                          parseFloat(errorRate) > 1 ? 'text-yellow-600' :
                          'text-blue-600'
                        }`}>
                          {errorRate}%
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(session)}</TableCell>
                      <TableCell>
                        <Link href={`/import-errors/${session.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View Errors
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
});

export default ImportErrorsList;

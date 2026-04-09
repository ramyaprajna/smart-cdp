/**
 * Archive Management Page
 *
 * Comprehensive administrator interface for data archiving and restoration.
 * Provides secure CRUD operations and selective restore capabilities.
 *
 * Features:
 * - Archive creation with customizable options
 * - Archive browsing with search and filtering
 * - Metadata editing and management
 * - Selective and full data restoration
 * - Application data cleaning
 * - Statistics and monitoring
 *
 * Last Updated: August 15, 2025 - Secure refresh system implementation
 * Integration Status: ✅ COMPLETE - Administrator toolset with secure refresh
 */

import React, { memo, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Archive,
  Database,
  Download,
  Upload,
  Trash2,
  Edit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useArchiveManagement, type CreateArchiveOptions, type RestoreOptions } from '@/hooks/use-archive-management';
import { useSecureRefresh } from '@/hooks/use-secure-refresh-fixed';
import { SecureRefreshButton } from '@/components/common/secure-refresh-button';
import { useToast } from '@/hooks/use-toast';

/**
 * Archive Statistics Component
 */
const ArchiveStatistics: React.FC = memo(() => {
  const { statistics, isLoadingStats, refetchStats, refetchArchives, formatFileSize } = useArchiveManagement();
  const { toast } = useToast();

  // Secure refresh implementation
  const handleSecureRefresh = useCallback(async () => {
    await Promise.all([
      refetchStats(),
      refetchArchives()
    ]);
  }, [refetchStats, refetchArchives]);

  const {
    isRefreshing,
    refresh: executeSecureRefresh,
    error: refreshError
  } = useSecureRefresh(handleSecureRefresh, {
    onSuccess: () => {
      toast({
        title: "Refreshed Successfully",
        description: "Archive statistics and data have been refreshed.",
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

  if (isLoadingStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Archive Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!statistics) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Archive Statistics
          </CardTitle>
          <SecureRefreshButton
            onClick={executeSecureRefresh}
            isRefreshing={isRefreshing}
            text={{
              idle: "Refresh",
              refreshing: "Refreshing..."
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="text-center p-3 sm:p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{statistics.totalArchives}</div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Archives</div>
          </div>
          <div className="text-center p-3 sm:p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
            <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
              {formatFileSize(statistics.totalDataSize)}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Size</div>
          </div>
          <div className="text-center p-3 sm:p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg sm:col-span-2 lg:col-span-1">
            <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
              {statistics.totalRecordsArchived.toLocaleString()}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Records Archived</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Create Archive Dialog Component
 */
const CreateArchiveDialog: React.FC = memo(() => {
  const { createArchive, isCreating } = useArchiveManagement();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [archiveData, setArchiveData] = useState<CreateArchiveOptions>({
    name: '',
    description: '',
    archiveType: 'full'
  });

  const handleCreate = useCallback(async () => {
    try {
      // Generate automatic name if blank
      const finalArchiveData = {
        ...archiveData,
        name: archiveData.name.trim() || `Weekly Backup ${new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(/[/:]/g, '-').replace(', ', ' ')}`
      };

      await createArchive(finalArchiveData);
      toast({
        title: 'Archive Created',
        description: `Archive "${finalArchiveData.name}" has been created successfully.`,
      });
      setIsOpen(false);
      setArchiveData({ name: '', description: '', archiveType: 'full' });
    } catch (error) {
      toast({
        title: 'Archive Creation Failed',
        description: error instanceof Error ? error.message : 'Failed to create archive',
        variant: 'destructive',
      });
    }
  }, [archiveData, createArchive, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Create Archive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-blue-600" />
            Create New Archive
          </DialogTitle>
          <DialogDescription>
            Create a backup of current application data for restoration purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="archive-name">Archive Name</Label>
            <Input
              id="archive-name"
              value={archiveData.name}
              onChange={(e) => setArchiveData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Weekly Backup 2025-08-01"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="archive-description">Description (Optional)</Label>
            <Textarea
              id="archive-description"
              value={archiveData.description}
              onChange={(e) => setArchiveData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose of this archive..."
              className="mt-1"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="archive-type">Archive Type</Label>
            <Select
              value={archiveData.archiveType}
              onValueChange={(value: 'full' | 'partial' | 'backup') =>
                setArchiveData(prev => ({ ...prev, archiveType: value }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Archive - Complete application data</SelectItem>
                <SelectItem value="backup">Backup Archive - Essential data only</SelectItem>
                <SelectItem value="partial">Partial Archive - Custom selection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-2" />
                  Create Archive
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Edit Archive Dialog Component
 */
const EditArchiveDialog: React.FC<{
  archive: any;
  onClose: () => void;
}> = memo(({ archive, onClose }) => {
  const { updateArchive, isUpdating } = useArchiveManagement();
  const { toast } = useToast();
  const [archiveData, setArchiveData] = useState({
    name: archive?.name || '',
    description: archive?.description || ''
  });

  const handleUpdate = useCallback(async () => {
    if (!archive?.id) return;

    try {
      await updateArchive(archive.id, archiveData);
      toast({
        title: 'Archive Updated',
        description: 'Archive has been updated successfully.',
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update archive',
        variant: 'destructive',
      });
    }
  }, [archive?.id, archiveData, updateArchive, toast, onClose]);

  if (!archive) return null;

  return (
    <Dialog open={!!archive} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-600" />
            Edit Archive
          </DialogTitle>
          <DialogDescription>
            Update archive name and description.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-archive-name">Archive Name</Label>
            <Input
              id="edit-archive-name"
              value={archiveData.name}
              onChange={(e) => setArchiveData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Archive name"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="edit-archive-description">Description</Label>
            <Textarea
              id="edit-archive-description"
              value={archiveData.description}
              onChange={(e) => setArchiveData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Archive description"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleUpdate}
              disabled={isUpdating || !archiveData.name.trim()}
              className="flex-1"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Update Archive
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Archive Item Component
 */
interface ArchiveItemProps {
  archive: any;
  onEdit: (archive: any) => void;
  onDelete: (archiveId: string) => void;
  onRestore: (archiveId: string) => void;
}

const ArchiveItem: React.FC<ArchiveItemProps> = memo(({ archive, onEdit, onDelete, onRestore }) => {
  const { formatFileSize, getArchiveStatusColor, getArchiveTypeLabel } = useArchiveManagement();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'creating': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'restored': return <Download className="h-4 w-4 text-purple-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const totalRecords = archive.recordCounts ?
    Object.values(archive.recordCounts as Record<string, number>).reduce((a: number, b: number) => a + b, 0) : 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              {getStatusIcon(archive.status)}
              <span className="truncate">{archive.name}</span>
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              {archive.description || 'No description provided'}
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${getArchiveStatusColor(archive.status)} shrink-0`}>
            {archive.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
          <div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Type</div>
            <div className="font-medium text-sm sm:text-base truncate">{getArchiveTypeLabel(archive.archiveType)}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Size</div>
            <div className="font-medium text-sm sm:text-base">{formatFileSize(archive.dataSize || 0)}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Records</div>
            <div className="font-medium text-sm sm:text-base">{totalRecords.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Created</div>
            <div className="font-medium">
              {new Date(archive.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {archive.restoredAt && (
          <div className="mb-4 p-2 bg-purple-50 rounded-lg">
            <div className="text-sm text-purple-700">
              Restored on {new Date(archive.restoredAt).toLocaleString()}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(archive)}
            className="flex-1"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRestore(archive.id)}
            disabled={archive.status !== 'completed'}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            Restore
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(archive.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Restore Dialog Component
 */
const RestoreDialog: React.FC<{
  archiveId: string | null;
  onClose: () => void;
  onRestore: (archiveId: string, options: RestoreOptions) => Promise<void>;
}> = memo(({ archiveId, onClose, onRestore }) => {
  const [restoreOptions, setRestoreOptions] = useState<RestoreOptions>({
    restoreType: 'full',
    replaceExisting: false,
    validateData: true
  });
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = useCallback(async () => {
    if (!archiveId) return;

    setIsRestoring(true);
    try {
      await onRestore(archiveId, restoreOptions);
      onClose();
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  }, [archiveId, restoreOptions, onRestore, onClose]);

  if (!archiveId) return null;

  return (
    <Dialog open={!!archiveId} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Restore Archive
          </DialogTitle>
          <DialogDescription>
            Configure restoration options for the selected archive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Restore Type</Label>
            <Select
              value={restoreOptions.restoreType}
              onValueChange={(value: 'full' | 'selective') =>
                setRestoreOptions(prev => ({ ...prev, restoreType: value }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Restore - All archived data</SelectItem>
                <SelectItem value="selective">Selective Restore - Choose tables</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="replace-existing"
                checked={restoreOptions.replaceExisting}
                onCheckedChange={(checked) =>
                  setRestoreOptions(prev => ({ ...prev, replaceExisting: !!checked }))
                }
              />
              <Label htmlFor="replace-existing" className="text-sm">
                Replace existing data
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="validate-data"
                checked={restoreOptions.validateData}
                onCheckedChange={(checked) =>
                  setRestoreOptions(prev => ({ ...prev, validateData: !!checked }))
                }
              />
              <Label htmlFor="validate-data" className="text-sm">
                Validate data integrity
              </Label>
            </div>
          </div>

          {restoreOptions.replaceExisting && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Warning: This will permanently replace existing application data.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleRestore}
              disabled={isRestoring}
              className="flex-1"
              variant={restoreOptions.replaceExisting ? "destructive" : "default"}
            >
              {isRestoring ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Restore Archive
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Main Archive Management Component
 */
const ArchiveManagement = memo(function ArchiveManagement() {
  const {
    archives,
    totalArchives,
    isLoadingArchives,
    currentPage,
    totalPages,
    searchQuery,
    updateSearch,
    goToPage,
    deleteArchive,
    restoreArchive,
    cleanApplicationData,
    refetchArchives,
    isCleaning,
    archivesError
  } = useArchiveManagement();



  const { toast } = useToast();
  const [restoreArchiveId, setRestoreArchiveId] = useState<string | null>(null);
  const [editingArchive, setEditingArchive] = useState<any>(null);

  const handleDelete = useCallback(async (archiveId: string) => {
    if (!confirm('Are you sure you want to delete this archive? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteArchive(archiveId);
      toast({
        title: 'Archive Deleted',
        description: 'Archive has been deleted successfully.',
      });
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete archive',
        variant: 'destructive',
      });
    }
  }, [deleteArchive, toast]);

  const handleRestore = useCallback(async (archiveId: string, options: RestoreOptions) => {
    try {
      await restoreArchive(archiveId, options);
      toast({
        title: 'Archive Restored',
        description: 'Archive data has been restored successfully.',
      });
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: error instanceof Error ? error.message : 'Failed to restore archive',
        variant: 'destructive',
      });
    }
  }, [restoreArchive, toast]);

  const handleCleanData = useCallback(async () => {
    if (!confirm('Are you sure you want to clean all application data? This will remove all current data and cannot be undone.')) {
      return;
    }

    try {
      await cleanApplicationData();
      toast({
        title: 'Data Cleaned',
        description: 'Application data has been cleaned successfully.',
      });
    } catch (error) {
      toast({
        title: 'Clean Failed',
        description: error instanceof Error ? error.message : 'Failed to clean data',
        variant: 'destructive',
      });
    }
  }, [cleanApplicationData, toast]);

  if (archivesError) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load archives. Please check your permissions and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
            Archive Management
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Manage data archives, backups, and restoration operations
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleCleanData}
            disabled={isCleaning}
            className="w-full sm:w-auto"
          >
            {isCleaning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Clean Data
              </>
            )}
          </Button>
          <CreateArchiveDialog />
        </div>
      </div>

      {/* Statistics */}
      <ArchiveStatistics />

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Archive Library</CardTitle>
          <CardDescription>
            Browse and manage your data archives
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[500px] sm:max-h-[600px] overflow-y-auto">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search archives..."
                  value={searchQuery}
                  onChange={(e) => updateSearch(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>
          </div>

          {/* Archives Grid */}
          {isLoadingArchives ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : archives.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <Archive className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No archives found</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">Create your first archive to get started</p>
              <CreateArchiveDialog />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {archives.map((archive: any) => (
                  <ArchiveItem
                    key={archive.id}
                    archive={archive}
                    onEdit={setEditingArchive}
                    onDelete={handleDelete}
                    onRestore={setRestoreArchiveId}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                    Showing {archives.length} of {totalArchives} archives
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1">Previous</span>
                    </Button>
                    <span className="px-3 py-1 text-sm flex items-center">
                      {currentPage + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages - 1}
                    >
                      <span className="hidden sm:inline mr-1">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditArchiveDialog
        archive={editingArchive}
        onClose={() => setEditingArchive(null)}
      />

      {/* Restore Dialog */}
      <RestoreDialog
        archiveId={restoreArchiveId}
        onClose={() => setRestoreArchiveId(null)}
        onRestore={handleRestore}
      />
    </div>
  );
});

export default ArchiveManagement;

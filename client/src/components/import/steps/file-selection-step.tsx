/**
 * File Selection Step Component
 * Handles file upload, drag & drop, and initial file display
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, Brain } from "lucide-react";
import { LargeFileWarning } from "@/components/import/large-file-warning";
import type { PreviewData } from "@/hooks/use-data-import";

interface FileSelectionStepProps {
  selectedFile: File | null;
  previewData: PreviewData | null;
  isDragActive: boolean;
  isProcessing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (file: File) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onGeneratePreview: () => void;
  onOpenAIMapping: () => void;
  onOpenBulkAI: () => void;
}

export const FileSelectionStep = memo<FileSelectionStepProps>(function FileSelectionStep({
  selectedFile,
  previewData,
  isDragActive,
  isProcessing,
  fileInputRef,
  onFileSelect,
  onFileDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onGeneratePreview,
  onOpenAIMapping,
  onOpenBulkAI
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="file-upload">Select File</Label>
        <Input
          id="file-upload"
          type="file"
          accept=".json,.csv,.xlsx,.xls,.docx,.txt"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
          className="mt-2"
        />
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
        onDrop={onFileDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          Drag and drop your file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Supports Excel, CSV, DOCX, and TXT files up to 100MB
        </p>
      </div>

      {/* Selected File Display */}
      {selectedFile && (
        <div className="space-y-3">
          {/* Large File Warning */}
          <LargeFileWarning file={selectedFile} recordCount={previewData?.metadata?.totalRows} />

          <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
            <FileText className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onGeneratePreview}
                disabled={isProcessing}
                size="sm"
                variant="outline"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Preview'
                )}
              </Button>
              <Button
                onClick={onOpenAIMapping}
                disabled={isProcessing}
                size="sm"
              >
                <Brain className="w-4 h-4 mr-2" />
                AI Analysis
              </Button>
              <Button
                onClick={onOpenBulkAI}
                disabled={isProcessing}
                size="sm"
                variant="secondary"
              >
                <Brain className="w-4 h-4 mr-2" />
                Bulk AI
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

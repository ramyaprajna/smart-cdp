/**
 * Large File Warning Component
 *
 * Displays warnings and processing time estimates for large file imports
 * to set proper user expectations and provide optimization suggestions.
 */

import { AlertTriangle, Clock, Info, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { analyzeFileSize, estimateProcessingTime } from '@/constants/file-limits';

interface LargeFileWarningProps {
  file: File;
  recordCount?: number;
}

export function LargeFileWarning({ file, recordCount }: LargeFileWarningProps) {
  const fileAnalysis = analyzeFileSize(file.size);
  const sizeInMB = (file.size / 1024 / 1024).toFixed(1);

  if (!fileAnalysis.isLarge) {
    return null; // No warning needed for small files
  }

  const estimatedTime = recordCount ? estimateProcessingTime(recordCount) : 'Unknown';

  return (
    <div className="space-y-3">
      {/* File Size Warning */}
      <Alert className={fileAnalysis.isHuge ? "border-orange-200 bg-orange-50" : "border-yellow-200 bg-yellow-50"}>
        <AlertTriangle className={`h-4 w-4 ${fileAnalysis.isHuge ? 'text-orange-600' : 'text-yellow-600'}`} />
        <AlertTitle className="flex items-center gap-2">
          Large File Detected
          <Badge variant={fileAnalysis.isHuge ? "destructive" : "secondary"}>
            {sizeInMB}MB
          </Badge>
        </AlertTitle>
        <AlertDescription>
          {fileAnalysis.warningMessage}
        </AlertDescription>
      </Alert>

      {/* Processing Time Estimate */}
      {recordCount && (
        <Alert className="border-blue-200 bg-blue-50">
          <Clock className="h-4 w-4 text-blue-600" />
          <AlertTitle>Processing Time Estimate</AlertTitle>
          <AlertDescription>
            <div className="flex items-center justify-between mt-2">
              <span>Estimated time: <strong>{estimatedTime}</strong></span>
              <span className="text-sm text-muted-foreground">
                {recordCount.toLocaleString()} records
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Optimization Suggestions */}
      {fileAnalysis.isHuge && (
        <Alert className="border-green-200 bg-green-50">
          <Zap className="h-4 w-4 text-green-600" />
          <AlertTitle>Performance Recommendations</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• Keep this page open during import</li>
              <li>• Close unnecessary browser tabs to free memory</li>
              <li>• Consider splitting very large files into smaller batches</li>
              {fileAnalysis.shouldStream && (
                <li>• Streaming mode will be used for optimal performance</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Background Processing Info */}
      {fileAnalysis.isHuge && (
        <Alert className="border-purple-200 bg-purple-50">
          <Info className="h-4 w-4 text-purple-600" />
          <AlertTitle>Background Processing</AlertTitle>
          <AlertDescription>
            Large file processing includes background embedding generation.
            You can monitor progress from the dashboard after import completes.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

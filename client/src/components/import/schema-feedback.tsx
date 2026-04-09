/**
 * Schema Feedback Component - Display schema mapping results and excluded fields
 */
import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@radix-ui/react-collapsible';
import { ChevronDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface SchemaFeedbackProps {
  mappingFeedback?: {
    summary: string;
    details: string[];
    excludedFieldsSummary?: string;
  };
  schemaValidation?: {
    validMappings: Array<{
      sourceField: string;
      targetField: string;
      dataType: string;
    }>;
    excludedFields: Array<{
      field: string;
      reason: string;
      suggestion?: string;
    }>;
    warnings: string[];
  };
}

export const SchemaFeedback: React.FC<SchemaFeedbackProps> = ({
  mappingFeedback,
  schemaValidation
}) => {
  if (!mappingFeedback && !schemaValidation) {
    return null;
  }

  const hasExcludedFields = (schemaValidation?.excludedFields?.length || 0) > 0;
  const hasWarnings = (schemaValidation?.warnings?.length || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Summary Alert */}
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Schema Analysis Complete:</strong> {mappingFeedback?.summary}
        </AlertDescription>
      </Alert>

      {/* Excluded Fields */}
      {hasExcludedFields && (
        <Alert className="border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <strong>Excluded Fields:</strong> {mappingFeedback?.excludedFieldsSummary}

              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
                  <ChevronDown className="h-3 w-3" />
                  View details
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  {schemaValidation?.excludedFields?.map((excluded, index) => (
                    <div key={index} className="bg-red-50 dark:bg-red-900/20 p-3 rounded border">
                      <div className="font-medium text-red-800 dark:text-red-200">
                        {excluded.field}
                      </div>
                      <div className="text-sm text-red-600 dark:text-red-300 mt-1">
                        {excluded.reason}
                      </div>
                      {excluded.suggestion && (
                        <div className="text-sm text-red-500 dark:text-red-400 mt-1 italic">
                          💡 {excluded.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <strong>Import Warnings:</strong>
              <ul className="list-disc list-inside space-y-1">
                {schemaValidation?.warnings?.map((warning, index) => (
                  <li key={index} className="text-sm">{warning}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Valid Mappings */}
      {(schemaValidation?.validMappings?.length || 0) > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 hover:underline">
            <ChevronDown className="h-3 w-3" />
            View mapped fields ({schemaValidation?.validMappings?.length || 0})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {schemaValidation?.validMappings?.map((mapping, index) => (
                <div key={index} className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 p-2 rounded">
                  <span className="text-sm font-medium">{mapping.sourceField}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">→</span>
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                      {mapping.targetField}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default SchemaFeedback;

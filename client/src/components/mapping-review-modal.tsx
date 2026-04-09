/**
 * Intelligent Mapping Review Modal
 *
 * Secure, performance-optimized component for reviewing uncertain AI field mappings.
 * Shows interactive interface when AI confidence is low or conflicts are detected.
 *
 * Security Features:
 * - XSS protection for all displayed data
 * - Input sanitization for field mappings
 * - Validation of user mapping decisions
 *
 * Performance Features:
 * - React.memo for render optimization
 * - Efficient state management
 * - Minimal re-renders with useCallback
 *
 * @created August 13, 2025 - Enhanced data import with intelligent mapping review
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Security: Define interfaces with strict typing
export interface MappingDecision {
  sourceField: string;
  targetField: string;
  confidence?: number;
}

export interface UncertainMapping {
  sourceField: string;
  sanitizedFieldName: string;
  currentSuggestion: string | null;
  confidence: number;
  dataType: string;
  sampleData: string[];
  availableTargets: string[];
  reasoning: string;
  isConflict: boolean;
}

export interface MappingConflict {
  sourceField: string;
  conflictingFields: string[];
  confidence: number;
  reason: string;
  suggestedResolution: string;
}

export interface MappingReviewData {
  needsReview: boolean;
  reviewReason: 'low_confidence' | 'conflicts' | 'unknown_fields' | 'none';
  uncertainMappings: UncertainMapping[];
  conflicts: MappingConflict[];
  autoApprovedCount: number;
  totalMappings: number;
  recommendations: string[];
  confidenceThreshold: number;
}

interface MappingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewData: MappingReviewData;
  onApprove: (decisions: MappingDecision[], autoApprove?: boolean) => void;
  isProcessing?: boolean;
}

// Security: Available target field options with validation
const TARGET_FIELD_OPTIONS = [
  { value: 'firstName', label: 'First Name', type: 'text' },
  { value: 'lastName', label: 'Last Name', type: 'text' },
  { value: 'email', label: 'Email Address', type: 'email' },
  { value: 'phoneNumber', label: 'Phone Number', type: 'text' },
  { value: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
  { value: 'gender', label: 'Gender', type: 'text' },
  { value: 'currentAddress', label: 'Address', type: 'json' },
  { value: 'customerSegment', label: 'Customer Segment', type: 'text' },
  { value: 'lifetimeValue', label: 'Lifetime Value', type: 'number' },
  { value: 'custom_attribute', label: 'Create Custom Field', type: 'custom' },
  { value: 'skip', label: 'Skip This Field', type: 'skip' }
] as const;

/**
 * Performance: Memoized confidence badge component
 */
const ConfidenceBadge = React.memo(({ confidence }: { confidence: number }) => {
  const variant = confidence >= 80 ? 'default' : confidence >= 50 ? 'secondary' : 'destructive';
  const IconComponent = confidence >= 80 ? CheckCircle : confidence >= 50 ? Clock : AlertTriangle;

  return (
    <Badge variant={variant} className="ml-2 flex items-center gap-1">
      <IconComponent size={12} />
      {confidence}%
    </Badge>
  );
});

/**
 * Performance: Memoized sample data display component
 */
const SampleDataDisplay = React.memo(({ samples, dataType }: {
  samples: string[],
  dataType: string
}) => {
  // Security: Sanitize and limit sample data display
  const sanitizedSamples = samples
    .slice(0, 3)
    .map(sample => sample.substring(0, 50))
    .filter(sample => sample.length > 0);

  if (sanitizedSamples.length === 0) {
    return <span className="text-muted-foreground text-sm">No sample data</span>;
  }

  return (
    <div className="text-sm text-muted-foreground">
      <strong>Samples:</strong> {sanitizedSamples.join(', ')}
      {samples.length > 3 && <span>... (+{samples.length - 3} more)</span>}
    </div>
  );
});

/**
 * Performance: Memoized mapping card component for optimal rendering
 */
const MappingReviewCard = React.memo<{
  mapping: UncertainMapping;
  selectedValue: string;
  onMappingChange: (sourceField: string, targetField: string) => void;
}>(({ mapping, selectedValue, onMappingChange }) => {
  return (
    <Card className="p-4" data-testid={`mapping-card-${mapping.sanitizedFieldName}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium truncate" data-testid={`field-name-${mapping.sanitizedFieldName}`}>
              {mapping.sourceField}
            </h4>
            <ConfidenceBadge confidence={mapping.confidence} />
          </div>

          <div className="text-sm text-muted-foreground mb-2">
            <strong>Type:</strong> {mapping.dataType}
          </div>

          <SampleDataDisplay
            samples={mapping.sampleData}
            dataType={mapping.dataType}
          />

          {mapping.reasoning && (
            <div className="text-sm text-muted-foreground mt-2 italic">
              {mapping.reasoning}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 w-48">
          <label className="text-sm font-medium mb-2 block">Map to:</label>
          <Select
            value={selectedValue}
            onValueChange={(value) => onMappingChange(mapping.sourceField, value)}
            data-testid={`mapping-select-${mapping.sanitizedFieldName}`}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_FIELD_OPTIONS.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  data-testid={`option-${option.value}`}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
});

MappingReviewCard.displayName = 'MappingReviewCard';

/**
 * Main mapping review modal component
 */
export const MappingReviewModal: React.FC<MappingReviewModalProps> = React.memo(({
  isOpen,
  onClose,
  reviewData,
  onApprove,
  isProcessing = false
}) => {
  const { toast } = useToast();

  // State: User mapping decisions with proper initialization
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  // Performance: Initialize decisions when reviewData changes
  useEffect(() => {
    const initialDecisions: Record<string, string> = {};
    reviewData.uncertainMappings.forEach(mapping => {
      initialDecisions[mapping.sourceField] = mapping.currentSuggestion || 'custom_attribute';
    });
    setDecisions(initialDecisions);
  }, [reviewData.uncertainMappings]);

  // Performance: Memoized statistics
  const stats = useMemo(() => ({
    totalFields: reviewData.totalMappings,
    autoApproved: reviewData.autoApprovedCount,
    needsReview: reviewData.uncertainMappings.length,
    conflicts: reviewData.conflicts.length
  }), [reviewData]);

  // Performance: Memoized reason display
  const reasonInfo = useMemo(() => {
    switch (reviewData.reviewReason) {
      case 'low_confidence':
        return {
          icon: AlertTriangle,
          text: 'Low AI Confidence',
          description: 'Some field mappings have low confidence scores and need review'
        };
      case 'conflicts':
        return {
          icon: AlertTriangle,
          text: 'Mapping Conflicts',
          description: 'Multiple fields are trying to map to the same target'
        };
      case 'unknown_fields':
        return {
          icon: Info,
          text: 'Unknown Fields',
          description: 'Many fields don\'t match known database fields'
        };
      default:
        return {
          icon: CheckCircle,
          text: 'Review Complete',
          description: 'Ready for import'
        };
    }
  }, [reviewData.reviewReason]);

  const ReasonIcon = reasonInfo.icon;

  // Security: Validate and sanitize mapping decision
  const handleMappingChange = useCallback((sourceField: string, targetField: string) => {
    // Security: Validate field names
    if (!sourceField || typeof sourceField !== 'string') return;
    if (!targetField || typeof targetField !== 'string') return;

    // Security: Check if target field is valid
    const validTargets = TARGET_FIELD_OPTIONS.map(opt => opt.value);
    if (!validTargets.includes(targetField as any)) return;

    setDecisions(prev => ({
      ...prev,
      [sourceField]: targetField
    }));
  }, []);

  // Handle approval with validation
  const handleApprove = useCallback(() => {
    try {
      // Security: Validate all decisions
      const mappingDecisions: MappingDecision[] = Object.entries(decisions).map(([sourceField, targetField]) => {
        // Security: Sanitize field names
        const sanitizedSource = sourceField.substring(0, 50).replace(/[^\w\s-]/g, '');
        const sanitizedTarget = targetField === 'skip' ? 'skip' : targetField.substring(0, 50).replace(/[^\w-]/g, '');

        return {
          sourceField: sanitizedSource,
          targetField: sanitizedTarget,
          confidence: 100 // User-approved = high confidence
        };
      });

      if (mappingDecisions.length === 0) {
        toast({
          title: "No mappings to approve",
          description: "Please review the field mappings before approving",
          variant: "destructive"
        });
        return;
      }

      onApprove(mappingDecisions);
    } catch (error) {
      console.error('Error processing mapping decisions:', error);
      toast({
        title: "Approval failed",
        description: "There was an error processing your mapping decisions",
        variant: "destructive"
      });
    }
  }, [decisions, onApprove, toast]);

  // Handle auto-approve all high confidence mappings
  const handleAutoApprove = useCallback(() => {
    const autoDecisions: MappingDecision[] = reviewData.uncertainMappings
      .filter(mapping => mapping.confidence >= 60) // Only auto-approve reasonable confidence
      .map(mapping => ({
        sourceField: mapping.sourceField,
        targetField: mapping.currentSuggestion || 'custom_attribute',
        confidence: mapping.confidence
      }));

    onApprove(autoDecisions, true);
  }, [reviewData.uncertainMappings, onApprove]);

  // Don't render if not needed
  if (!reviewData.needsReview) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="mapping-review-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="modal-title">
            <ReasonIcon size={20} className="text-orange-500" />
            Review Field Mappings
          </DialogTitle>
          <DialogDescription data-testid="modal-description">
            {reasonInfo.description}. Please review and approve the suggested field mappings below.
          </DialogDescription>
        </DialogHeader>

        {/* Statistics Card */}
        <Card className="mb-4" data-testid="mapping-stats-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Mapping Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center" data-testid="stat-auto-approved">
                <div className="font-semibold text-lg text-green-600">{stats.autoApproved}</div>
                <div className="text-muted-foreground">Auto-approved</div>
              </div>
              <div className="text-center" data-testid="stat-needs-review">
                <div className="font-semibold text-lg text-orange-600">{stats.needsReview}</div>
                <div className="text-muted-foreground">Need review</div>
              </div>
              <div className="text-center" data-testid="stat-conflicts">
                <div className="font-semibold text-lg text-red-600">{stats.conflicts}</div>
                <div className="text-muted-foreground">Conflicts</div>
              </div>
              <div className="text-center" data-testid="stat-total-fields">
                <div className="font-semibold text-lg">{stats.totalFields}</div>
                <div className="text-muted-foreground">Total fields</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        {reviewData.recommendations.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {reviewData.recommendations.map((rec, index) => (
                  <li key={`recommendation-${index}-${rec.slice(0, 20)}`} data-testid={`recommendation-${index}`}>
                    {rec}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Mapping Review Table */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Field Mappings Requiring Review</h3>

          {reviewData.uncertainMappings.map((mapping) => (
            <MappingReviewCard
              key={`mapping-${mapping.sourceField}-${mapping.sanitizedFieldName}`}
              mapping={mapping}
              selectedValue={decisions[mapping.sourceField] || 'custom_attribute'}
              onMappingChange={handleMappingChange}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t" data-testid="action-buttons">
          <div className="space-x-2">
            <Button
              variant="outline"
              onClick={handleAutoApprove}
              disabled={isProcessing}
              data-testid="auto-approve-button"
            >
              Auto-approve High Confidence
            </Button>
          </div>

          <div className="space-x-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              data-testid="cancel-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isProcessing}
              className="min-w-24"
              data-testid="approve-button"
            >
              {isProcessing ? 'Processing...' : `Approve ${Object.keys(decisions).length} Mappings`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

MappingReviewModal.displayName = 'MappingReviewModal';

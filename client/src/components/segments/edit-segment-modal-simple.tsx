/**
 * Simple Segment Edit Modal - MVP Implementation
 * 
 * Progressive Enhancement Approach:
 * Phase 1 (MVP): Basic name/description/status editing
 * Phase 2: Enhanced validation and UX improvements based on usage
 * Phase 3: Advanced features only when needed
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Segment {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  customerCount?: number;
}

interface EditSegmentModalProps {
  segment: Segment | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (segmentId: string, updateData: any) => Promise<void>;
}

export function EditSegmentModal({ segment, isOpen, onClose, onSave }: EditSegmentModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Initialize form when segment changes
  useEffect(() => {
    if (segment && isOpen) {
      setName(segment.name || '');
      setDescription(segment.description || '');
      setIsActive(segment.isActive);
      setHasChanges(false);
    }
  }, [segment, isOpen]);

  // Track changes
  useEffect(() => {
    if (segment) {
      const nameChanged = name !== (segment.name || '');
      const descChanged = description !== (segment.description || '');
      const statusChanged = isActive !== segment.isActive;
      setHasChanges(nameChanged || descChanged || statusChanged);
    }
  }, [name, description, isActive, segment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!segment || !name.trim()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Validate segment ID before sending
      if (!segment.id || typeof segment.id !== 'string') {
        throw new Error(`Invalid segment ID: ${segment.id}`);
      }

      const updateData = {
        name: name.trim(),
        description: description.trim() || null,
        isActive: isActive
      };

      await onSave(segment.id, updateData);
      
      toast({
        title: "Segment Updated",
        description: "Changes saved successfully"
      });
      
      onClose();
    } catch (error) {
      toast({
        title: "Update Failed", 
        description: error instanceof Error ? error.message : "Failed to save changes",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!segment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Edit Segment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current info */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span>Customer Count:</span>
              <Badge variant="secondary">
                {segment.customerCount?.toLocaleString() || '—'}
              </Badge>
            </div>
          </div>

          {/* Name field */}
          <div>
            <Label htmlFor="name">Segment Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter segment name"
              disabled={isSubmitting}
              data-testid="input-segment-name"
              required
            />
          </div>

          {/* Description field */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this segment (optional)"
              rows={3}
              disabled={isSubmitting}
              data-testid="textarea-segment-description"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isSubmitting}
              data-testid="switch-segment-active"
            />
            <Label htmlFor="active">Active Segment</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim() || !hasChanges}
              data-testid="button-save"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {hasChanges ? 'Save Changes' : 'No Changes'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
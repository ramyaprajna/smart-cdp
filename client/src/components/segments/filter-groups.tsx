/**
 * Filter Groups Component - AND/OR logic and visual grouping for segment criteria
 * 
 * Provides visual interface for creating complex segment criteria with logical grouping,
 * nested conditions, and drag-and-drop reordering capabilities.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FilterRow, FilterCriteria } from './filter-row';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  filters: FilterCriteria[];
  groups?: FilterGroup[]; // Nested groups for complex logic
}

interface FilterGroupsProps {
  group: FilterGroup;
  onUpdate: (groupId: string, updates: Partial<FilterGroup>) => void;
  onRemove?: (groupId: string) => void;
  onAddFilter: (groupId: string) => void;
  onAddGroup: (parentGroupId: string) => void;
  onUpdateFilter: (filterId: string, updates: Partial<FilterCriteria>) => void;
  onRemoveFilter: (filterId: string) => void;
  isNested?: boolean;
  userRole?: string;
  isAuthenticated?: boolean;
  maxDepth?: number;
  currentDepth?: number;
}

export function FilterGroups({
  group,
  onUpdate,
  onRemove,
  onAddFilter,
  onAddGroup,
  onUpdateFilter,
  onRemoveFilter,
  isNested = false,
  userRole = 'public',
  isAuthenticated = false,
  maxDepth = 3,
  currentDepth = 0
}: FilterGroupsProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  
  const canAddNestedGroup = currentDepth < maxDepth;
  const hasContent = group.filters.length > 0 || (group.groups && group.groups.length > 0);
  
  // Handle logic change (AND/OR)
  const handleLogicChange = useCallback((newLogic: 'AND' | 'OR') => {
    onUpdate(group.id, { logic: newLogic });
  }, [group.id, onUpdate]);
  
  // Handle drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, filterId: string) => {
    e.dataTransfer.setData('text/plain', filterId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const filterId = e.dataTransfer.getData('text/plain');
    // For now, just reorder within the same group
    // Could implement cross-group moving later if needed
  }, []);
  
  // Render logic indicator
  const renderLogicIndicator = () => {
    if (!hasContent || (group.filters.length <= 1 && (!group.groups || group.groups.length === 0))) {
      return null;
    }
    
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-muted-foreground">Combine with:</span>
        <Select value={group.logic} onValueChange={handleLogicChange}>
          <SelectTrigger className="w-20" data-testid={`select-logic-${group.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {group.logic === 'AND' ? 'All conditions must match' : 'Any condition can match'}
        </Badge>
      </div>
    );
  };
  
  // Render action buttons
  const renderActions = () => (
    <div className="flex items-center gap-2 mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAddFilter(group.id)}
        className="text-sm"
        data-testid={`button-add-filter-${group.id}`}
      >
        <Plus className="w-4 h-4 mr-1" />
        Add Filter
      </Button>
      
      {canAddNestedGroup && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddGroup(group.id)}
          className="text-sm"
          data-testid={`button-add-group-${group.id}`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Group
        </Button>
      )}
      
      {isNested && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(group.id)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          data-testid={`button-remove-group-${group.id}`}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Remove Group
        </Button>
      )}
    </div>
  );
  
  // Main render
  const content = (
    <div
      className={cn(
        "space-y-3",
        isDragOver && "bg-accent/20 rounded-lg p-2",
        isNested && "pl-4 border-l-2 border-muted"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`filter-group-${group.id}`}
    >
      {renderLogicIndicator()}
      
      {/* Individual Filters */}
      <div className="space-y-3">
        {group.filters.map((filter, index) => (
          <div 
            key={filter.id} 
            className="flex items-center gap-2"
            draggable
            onDragStart={(e) => handleDragStart(e, filter.id)}
          >
            {/* Logic Connector */}
            {index > 0 && (
              <div className="flex items-center">
                <Badge 
                  variant={group.logic === 'AND' ? 'default' : 'secondary'} 
                  className="text-xs px-2 py-1"
                >
                  {group.logic}
                </Badge>
              </div>
            )}
            
            {/* Drag Handle */}
            <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
              <GripVertical className="w-4 h-4" />
            </div>
            
            {/* Filter Row */}
            <div className="flex-1">
              <FilterRow
                filter={filter}
                onUpdate={onUpdateFilter}
                onRemove={onRemoveFilter}
                isRemovable={group.filters.length > 1 || !isNested}
                userRole={userRole}
                isAuthenticated={isAuthenticated}
              />
            </div>
          </div>
        ))}
      </div>
      
      {/* Nested Groups */}
      {group.groups && group.groups.length > 0 && (
        <div className="space-y-4 mt-4">
          {group.groups.map((nestedGroup, index) => (
            <div key={nestedGroup.id}>
              {/* Logic Connector for nested groups */}
              {(index > 0 || group.filters.length > 0) && (
                <div className="flex items-center mb-2">
                  <Badge 
                    variant={group.logic === 'AND' ? 'default' : 'secondary'} 
                    className="text-xs px-2 py-1"
                  >
                    {group.logic}
                  </Badge>
                </div>
              )}
              
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <FilterGroups
                    group={nestedGroup}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    onAddFilter={onAddFilter}
                    onAddGroup={onAddGroup}
                    onUpdateFilter={onUpdateFilter}
                    onRemoveFilter={onRemoveFilter}
                    isNested={true}
                    userRole={userRole}
                    isAuthenticated={isAuthenticated}
                    maxDepth={maxDepth}
                    currentDepth={currentDepth + 1}
                  />
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
      
      {renderActions()}
    </div>
  );
  
  // Wrap in card if this is a nested group
  if (isNested) {
    return content;
  }
  
  // Root group - always show content
  return (
    <div className="space-y-4">
      {hasContent ? content : (
        <div className="text-center py-8 text-muted-foreground">
          <p className="mb-4">No filters added yet</p>
          <Button
            variant="outline"
            onClick={() => onAddFilter(group.id)}
            data-testid="button-add-first-filter"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Filter
          </Button>
        </div>
      )}
    </div>
  );
}
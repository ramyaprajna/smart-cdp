import React from 'react';
import { FileText } from 'lucide-react';

export const EmptyState: React.FC = () => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <p className="text-muted-foreground">No import records found</p>
      <p className="text-sm text-muted-foreground">
        Try adjusting your search filters or import some data to see history
      </p>
    </div>
  );
};
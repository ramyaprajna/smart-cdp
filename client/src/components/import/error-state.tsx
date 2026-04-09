import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { XCircle } from 'lucide-react';

export const ErrorState: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-red-500">
            <XCircle className="h-6 w-6 mr-2" />
            Failed to load import history
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
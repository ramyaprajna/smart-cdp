import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';

export const LoadingState: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="h-6 w-6 animate-spin mr-2" />
            Loading import history...
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
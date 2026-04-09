import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { ImportStatus } from '../../types/import';
import { STATUS_VARIANTS } from '../../constants/import';

interface StatusIconProps {
  status: ImportStatus;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const iconProps = { className: "h-4 w-4" };

  switch (status) {
    case 'completed':
      return <CheckCircle {...iconProps} className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle {...iconProps} className="h-4 w-4 text-red-500" />;
    case 'processing':
      return <Clock {...iconProps} className="h-4 w-4 text-blue-500" />;
    case 'pending':
      return <AlertCircle {...iconProps} className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock {...iconProps} className="h-4 w-4 text-gray-500" />;
  }
};

interface StatusBadgeProps {
  status: ImportStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const variant = STATUS_VARIANTS[status] || 'outline';
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge variant={variant as any}>
      {label}
    </Badge>
  );
};

interface StatusDisplayProps {
  status: ImportStatus;
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({ status }) => {
  return (
    <div className="flex items-center space-x-2">
      <StatusIcon status={status} />
      <StatusBadge status={status} />
    </div>
  );
};

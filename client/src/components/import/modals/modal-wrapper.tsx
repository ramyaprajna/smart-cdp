/**
 * Reusable Modal Wrapper Component
 * Provides consistent modal structure and behavior
 */

import { memo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

interface ModalWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
}

export const ModalWrapper = memo<ModalWrapperProps>(function ModalWrapper({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = '6xl'
}) {
  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white dark:bg-gray-900 rounded-lg ${maxWidthClasses[maxWidth]} w-full max-h-[90vh] overflow-hidden`}>
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            {icon}
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
});

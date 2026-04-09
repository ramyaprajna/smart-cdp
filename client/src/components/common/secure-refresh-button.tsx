/**
 * Secure Refresh Button Component
 *
 * Reusable refresh button with consistent animation and behavior
 * across all dashboard pages. Provides secure, robust refresh functionality.
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecureRefreshButtonProps {
  onClick: () => void;
  isRefreshing: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary" | "ghost";
  text?: {
    idle: string;
    refreshing: string;
  };
}

export const SecureRefreshButton = memo<SecureRefreshButtonProps>(function SecureRefreshButton({
  onClick,
  isRefreshing,
  disabled = false,
  className,
  size = "sm",
  variant = "outline",
  text = {
    idle: "Refresh Data",
    refreshing: "Refreshing..."
  }
}) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={isRefreshing || disabled}
      className={cn("flex items-center gap-2", className)}
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {isRefreshing ? text.refreshing : text.idle}
    </Button>
  );
});

export default SecureRefreshButton;

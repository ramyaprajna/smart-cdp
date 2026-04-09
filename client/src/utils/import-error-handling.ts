/**
 * Centralized error handling utilities for import functionality
 * Provides consistent error messages, logging, and user feedback
 */

import { useToast } from "@/hooks/use-toast";

export interface ImportError {
  code: string;
  message: string;
  details?: string;
  recoverable?: boolean;
}

export const ImportErrorCodes = {
  FILE_VALIDATION: 'FILE_VALIDATION',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DUPLICATE_ANALYSIS: 'DUPLICATE_ANALYSIS',
  IMPORT_TIMEOUT: 'IMPORT_TIMEOUT',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export const createImportError = (
  code: keyof typeof ImportErrorCodes,
  message: string,
  details?: string,
  recoverable = false
): ImportError => ({
  code,
  message,
  details,
  recoverable
});

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'An unknown error occurred';
};

export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
};

export const isTimeoutError = (error: unknown): boolean => {
  const message = getErrorMessage(error);
  return message.includes('timeout') || message.includes('timed out');
};

export const useImportErrorHandler = () => {
  const { toast } = useToast();

  const handleError = (error: ImportError | unknown, context?: string) => {
    let importError: ImportError;

    if (error && typeof error === 'object' && 'code' in error) {
      importError = error as ImportError;
    } else {
      const message = getErrorMessage(error);
      let code: keyof typeof ImportErrorCodes = 'UNKNOWN_ERROR';

      if (isNetworkError(error)) {
        code = 'NETWORK_ERROR';
      } else if (isTimeoutError(error)) {
        code = 'IMPORT_TIMEOUT';
      }

      importError = createImportError(code, message);
    }

    // Log error for debugging (safely without circular references)
    console.error(`[Import Error${context ? ` - ${context}` : ''}]:`, {
      code: importError.code,
      message: importError.message,
      details: importError.details,
      recoverable: importError.recoverable
    });

    // Show user-friendly toast
    toast({
      title: getErrorTitle(importError.code),
      description: importError.message,
      variant: "destructive"
    });

    return importError;
  };

  const showSuccessMessage = (title: string, description: string) => {
    toast({
      title,
      description,
      variant: "default"
    });
  };

  const showWarningMessage = (title: string, description: string) => {
    toast({
      title,
      description,
      variant: "default"
    });
  };

  return {
    handleError,
    showSuccessMessage,
    showWarningMessage
  };
};

const getErrorTitle = (code: string): string => {
  switch (code) {
    case ImportErrorCodes.FILE_VALIDATION:
      return "File validation failed";
    case ImportErrorCodes.FILE_TOO_LARGE:
      return "File too large";
    case ImportErrorCodes.UNSUPPORTED_TYPE:
      return "Unsupported file type";
    case ImportErrorCodes.NETWORK_ERROR:
      return "Network error";
    case ImportErrorCodes.DUPLICATE_ANALYSIS:
      return "Duplicate analysis failed";
    case ImportErrorCodes.IMPORT_TIMEOUT:
      return "Import timeout";
    case ImportErrorCodes.SESSION_NOT_FOUND:
      return "Session not found";
    default:
      return "Import error";
  }
};
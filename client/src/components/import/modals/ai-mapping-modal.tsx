/**
 * AI Mapping Modal Component
 * Wraps AI column mapping functionality in a modal
 */

import { memo } from "react";
import { Brain } from "lucide-react";
import { ModalWrapper } from "./modal-wrapper";
import { AIColumnMapper } from "@/components/import/ai-column-mapper";
import type { AIColumnMappingResult } from "@/hooks/use-ai-column-mapping";

interface AIMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFile: File;
  onMappingComplete: (mappings: Record<string, string>, analysis: AIColumnMappingResult) => void;
  onError: (error: string) => void;
}

export const AIMappingModal = memo<AIMappingModalProps>(function AIMappingModal({
  isOpen,
  onClose,
  selectedFile,
  onMappingComplete,
  onError
}) {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="AI-Powered Column Mapping"
      icon={<Brain className="h-5 w-5 text-blue-600" />}
      maxWidth="6xl"
    >
      <AIColumnMapper
        file={selectedFile}
        onMappingComplete={onMappingComplete}
        onError={onError}
      />
    </ModalWrapper>
  );
});
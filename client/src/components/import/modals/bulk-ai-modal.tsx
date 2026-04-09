/**
 * Bulk AI Modal Component
 * Wraps bulk AI mapping functionality in a modal
 */

import { memo } from "react";
import { Brain } from "lucide-react";
import { ModalWrapper } from "./modal-wrapper";
import { BulkAIMapper } from "@/components/import/bulk-ai-mapper";

interface BulkAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMappingComplete: (mappings: Record<string, string>) => void;
  onError: (error: string) => void;
}

export const BulkAIModal = memo<BulkAIModalProps>(function BulkAIModal({
  isOpen,
  onClose,
  onMappingComplete,
  onError
}) {
  const handleMappingComplete = (mappings: Record<string, string>) => {
    onMappingComplete(mappings);
    onClose();
  };

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk AI Analysis & Mapping"
      icon={<Brain className="h-5 w-5 text-blue-600" />}
      maxWidth="7xl"
    >
      <BulkAIMapper
        onMappingComplete={handleMappingComplete}
        onError={onError}
      />
    </ModalWrapper>
  );
});
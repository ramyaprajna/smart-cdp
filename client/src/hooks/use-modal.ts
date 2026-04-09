/**
 * Reusable modal state management hook
 * Consolidates common modal patterns across components
 */

import { useState, useCallback } from "react";

export interface UseModalReturn<T = any> {
  isOpen: boolean;
  selectedItem: T | null;
  mode: "create" | "edit" | "view";
  openModal: (mode: "create" | "edit" | "view", item?: T) => void;
  closeModal: () => void;
  openCreateModal: () => void;
  openEditModal: (item: T) => void;
  openViewModal: (item: T) => void;
}

/**
 * Hook for managing modal state with create/edit/view modes
 * Reduces boilerplate modal management code
 */
export function useModal<T = any>(): UseModalReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "view">("create");

  const openModal = useCallback((modalMode: "create" | "edit" | "view", item?: T) => {
    setMode(modalMode);
    setSelectedItem(item || null);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedItem(null);
  }, []);

  const openCreateModal = useCallback(() => {
    openModal("create");
  }, [openModal]);

  const openEditModal = useCallback((item: T) => {
    openModal("edit", item);
  }, [openModal]);

  const openViewModal = useCallback((item: T) => {
    openModal("view", item);
  }, [openModal]);

  return {
    isOpen,
    selectedItem,
    mode,
    openModal,
    closeModal,
    openCreateModal,
    openEditModal,
    openViewModal
  };
}
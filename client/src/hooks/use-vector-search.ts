/**
 * Custom hook for vector search functionality
 * Manages search state, filters, and result handling
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { findSimilarCustomers } from '@/lib/api';
import { getErrorMessage } from '@/utils/api-helpers';
import { useToast } from '@/hooks/use-toast';

interface SimilarCustomer {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  currentAddress?: any;
  customerSegment: string | null;
  lifetimeValue: number | null;
  lastActiveAt?: Date | string | null;
  dataQualityScore: number | null;
  importId?: string | null;
  sourceRowNumber?: number | null;
  sourceFileHash?: string | null;
  dataLineage?: any;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  similarity: number;
  embeddingType?: string;
  lastGeneratedAt?: Date | string;
  identifiers?: Array<{
    identifierType: string;
    identifierValue: string;
    sourceSystem: string | null;
  }>;
}

interface SearchFilters {
  threshold: number;
  resultLimit: number;
}

export function useVectorSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({
    threshold: 15,
    resultLimit: 10
  });
  const [results, setResults] = useState<SimilarCustomer[]>([]);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SimilarCustomer | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; threshold: number; limit: number }) => {
      if (!params.query.trim()) {
        throw new Error('Search query is required');
      }
      return findSimilarCustomers(params.query, params.threshold, params.limit);
    },
    onSuccess: (data) => {
      setResults(data);
      toast({
        title: "Search completed",
        description: `Found ${data.length} similar customers`
      });
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      toast({
        title: "Search failed",
        description: message,
        variant: "destructive"
      });
      setResults([]);
    }
  });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search query required",
        description: "Please enter a search query",
        variant: "destructive"
      });
      return;
    }

    searchMutation.mutate({
      query: searchQuery.trim(),
      threshold: filters.threshold / 100,
      limit: filters.resultLimit
    });
  }, [searchQuery, filters, searchMutation, toast]);

  const updateFilter = useCallback(<K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSearch = useCallback(() => {
    setSearchQuery("");
    setResults([]);
    setFilters({ threshold: 15, resultLimit: 10 });
    setSelectedCustomer(null);
    setIsDetailModalOpen(false);
  }, []);

  const viewCustomerDetails = useCallback((customer: SimilarCustomer) => {
    setSelectedCustomer(customer);
    setIsDetailModalOpen(true);
  }, []);

  const closeCustomerDetails = useCallback(() => {
    setSelectedCustomer(null);
    setIsDetailModalOpen(false);
  }, []);

  const getSearchSuggestions = useCallback(() => {
    return [
      "Young professionals in Jakarta",
      "Entrepreneurs with high lifetime value",
      "Female customers in technology",
      "Students interested in music",
      "Active listeners from Tangerang"
    ];
  }, []);

  return {
    // Search state
    searchQuery,
    setSearchQuery,
    filters,
    results,
    selectedCustomer,

    // UI state
    isAdvancedOpen,
    setIsAdvancedOpen,
    isDetailModalOpen,
    setIsDetailModalOpen,

    // Actions
    handleSearch,
    updateFilter,
    resetSearch,
    viewCustomerDetails,
    closeCustomerDetails,

    // Status
    isLoading: searchMutation.isPending,
    error: searchMutation.error,

    // Helpers
    searchSuggestions: getSearchSuggestions(),
    hasResults: results.length > 0,
    canSearch: searchQuery.trim().length > 0
  };
}

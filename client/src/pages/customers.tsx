import { useState, memo, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import CustomerTable from "@/components/customers/customer-table";
import CustomerModal from "@/components/customers/customer-modal";
import { CustomerTableSkeleton } from "@/components/common/loading-states";
import { usePerformanceMonitor, useDebounceSearch } from "@/hooks/use-performance";
import { useModal } from "@/hooks/use-modal";
import { useSecureRefresh } from "@/hooks/use-secure-refresh-fixed";
import { getCustomers, searchCustomers, getFilteredCustomers } from "@/lib/api";
import { Customer } from "@shared/schema";
import { useDebounce } from "@/hooks/use-debounce";
import { Search, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { filterCustomers } from "@/utils/customer-filters";
import { useToast } from "@/hooks/use-toast";

export default memo(function Customers() {
  // Use custom modal hook for cleaner state management
  const {
    isOpen: isModalOpen,
    selectedItem: selectedCustomer,
    mode: modalMode,
    openCreateModal,
    openEditModal,
    openViewModal,
    closeModal
  } = useModal<Customer>();

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<CustomerFilters>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();

  // Determine if we should use filters
  const hasActiveFilters = Object.keys(filters).length > 0;

  // Fetch customers, search results, or filtered results with pagination
  const { data: customersData, isLoading, refetch } = useQuery({
    queryKey: debouncedSearchQuery
      ? ["/api/customers/search", debouncedSearchQuery, currentPage, pageSize]
      : hasActiveFilters
        ? ["/api/customers/filter", filters, currentPage, pageSize]
        : ["/api/customers", currentPage, pageSize],
    queryFn: debouncedSearchQuery
      ? () => searchCustomers(debouncedSearchQuery)
      : hasActiveFilters
        ? () => getFilteredCustomers(filters)
        : () => getCustomers(currentPage * pageSize, pageSize),
  });

  // Extract data with pagination info
  const customers = customersData?.customers || [];
  const totalCustomers = customersData?.total || 0;
  const totalPages = Math.ceil(totalCustomers / pageSize);

  // Toast notifications
  const { toast } = useToast();

  // Comprehensive refresh function
  const performRefresh = useCallback(async () => {
    // Invalidate all related cache entries for fresh data
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/customers/search"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/customers/filter"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] }),
      refetch() // Also trigger immediate refetch
    ]);
  }, [refetch, queryClient]);

  // Secure refresh management with comprehensive error handling
  const {
    isRefreshing,
    error: refreshError,
    duration,
    refresh: executeRefresh,
    clearError
  } = useSecureRefresh(performRefresh, {
    timeoutMs: 30000,
    debounceMs: 1000,
    onSuccess: () => {
      toast({
        title: "Customers refreshed",
        description: duration ? `Updated in ${duration}ms` : "Data updated successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh failed",
        description: error,
        variant: "destructive"
      });
    }
  });

  // Pagination handlers
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(0); // Reset to first page when changing page size
  }, []);

  // Simplified event handlers using the modal hook
  const handleViewCustomer = useCallback((customer: Customer) => {
    openViewModal(customer);
  }, [openViewModal]);

  const handleEditCustomer = useCallback((customer: Customer) => {
    openEditModal(customer);
  }, [openEditModal]);

  const handleAddCustomer = useCallback(() => {
    openCreateModal();
  }, [openCreateModal]);

  const handleFiltersChange = useCallback((newFilters: CustomerFilters) => {
    setFilters(newFilters);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(0); // Reset to first page when clearing filters
  }, []);

  return (
    <>
      <Header
        title="Customer Profiles"
        subtitle="Manage and explore your customer database"
        onSearch={setSearchQuery}
        onAction={handleAddCustomer}
        actionLabel="Add Customer"
        searchPlaceholder="Search by name, email, segment, or try: 'professional Jakarta', 'young entrepreneur'..."
      />

      {/* Secure Refresh Controls */}
      <div className="flex justify-end p-6 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={executeRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
        </Button>
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        {/* Customer Summary Section */}
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Customer Database Summary</CardTitle>
                    <CardDescription>Overview of your customer data</CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={executeRefresh}
                  disabled={isRefreshing || isLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-primary">
                    {totalCustomers.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Customers</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-primary">
                    {customers.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Current Page ({currentPage + 1} of {totalPages || 1})
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-primary">
                    {pageSize}
                  </div>
                  <div className="text-sm text-muted-foreground">Records per Page</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {debouncedSearchQuery && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Searching customers for: <strong>"{debouncedSearchQuery}"</strong>
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {totalCustomers} result{totalCustomers !== 1 ? 's' : ''} found
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Using enhanced search: database fields + AI semantic matching for customer characteristics
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <CustomerTable
            customers={customers}
            onViewCustomer={handleViewCustomer}
            onEditCustomer={handleEditCustomer}
            onAddCustomer={handleAddCustomer}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            // Pagination props
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCustomers={totalCustomers}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </main>

      <CustomerModal
        customer={selectedCustomer}
        mode={modalMode}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </>
  );
});

import { memo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, Edit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Customer } from "@shared/schema";
import CustomerFiltersComponent, { CustomerFilters } from "./customer-filters";
import { useCustomerTable } from "@/hooks/use-customer-table";

interface CustomerTableProps {
  customers: Customer[];
  onViewCustomer: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  onAddCustomer: () => void;
  filters: CustomerFilters;
  onFiltersChange: (filters: CustomerFilters) => void;
  onClearFilters: () => void;
  // Pagination props
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalCustomers: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const CustomerTable = memo<CustomerTableProps>(function CustomerTable({
  customers,
  onViewCustomer,
  onEditCustomer,
  onAddCustomer,
  filters,
  onFiltersChange,
  onClearFilters,
  currentPage,
  totalPages,
  pageSize,
  totalCustomers,
  onPageChange,
  onPageSizeChange
}) {
  const {
    getSegmentColor,
    getInitials,
    formatLifetimeValue,
    formatLastActive,
    formatAddress,
    getActiveFilterCount,
    exportCustomers
  } = useCustomerTable();

  const activeFilterCount = getActiveFilterCount(filters);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Customer Profiles</h3>
          <div className="flex items-center space-x-3">
            <CustomerFiltersComponent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onClearFilters={onClearFilters}
              activeFilterCount={activeFilterCount}
            />
            <Button variant="outline" size="sm" onClick={exportCustomers}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={onAddCustomer}>
              Add Customer
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Data Quality</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>LTV</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No customers found. Add your first customer to get started.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(customer.firstName, customer.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-foreground">
                          {customer.firstName} {customer.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {customer.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getSegmentColor(customer.customerSegment)}>
                      {customer.customerSegment || "Unassigned"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Progress
                        value={customer.dataQualityScore ? Number(customer.dataQualityScore) : 0}
                        className="w-16"
                      />
                      <span className="text-sm text-muted-foreground">
                        {customer.dataQualityScore ? `${Number(customer.dataQualityScore).toFixed(0)}%` : "0%"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatLastActive(customer.lastActiveAt)}
                  </TableCell>
                  <TableCell className="font-medium text-success">
                    {formatLifetimeValue(customer.lifetimeValue)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewCustomer(customer)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditCustomer(customer)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="p-4 border-t border-border bg-muted/20">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Page size selector */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Rows per page:</span>
            <Select value={pageSize.toString()} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Page info */}
          <div className="text-sm text-muted-foreground">
            Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalCustomers)} of {totalCustomers.toLocaleString()} customers
          </div>

          {/* Pagination buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(0)}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i;
                } else if (currentPage < 3) {
                  page = i;
                } else if (currentPage > totalPages - 4) {
                  page = totalPages - 5 + i;
                } else {
                  page = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => onPageChange(page)}
                    className="h-8 w-8 p-0"
                  >
                    {page + 1}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CustomerTable;

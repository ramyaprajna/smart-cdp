import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Settings, HelpCircle, Eye, MapPin, Calendar, DollarSign, User, Database, Hash, FileText, Activity, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVectorSearch } from "@/hooks/use-vector-search";

const VectorSearchPanel = memo(function VectorSearchPanel() {
  const {
    searchQuery,
    setSearchQuery,
    filters,
    results,
    selectedCustomer,
    isAdvancedOpen,
    setIsAdvancedOpen,
    isDetailModalOpen,
    setIsDetailModalOpen,
    handleSearch,
    updateFilter,
    resetSearch,
    viewCustomerDetails,
    closeCustomerDetails,
    isLoading,
    error,
    searchSuggestions,
    hasResults,
    canSearch
  } = useVectorSearch();

  const handleSearchSuggestion = (suggestion: string) => {
    setSearchQuery(suggestion);
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (value: string | number | null) => {
    if (!value) return 'N/A';
    return `$${Number(value).toLocaleString()}`;
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return `${first}${last}`.toUpperCase() || "??";
  };

  const getAvatarColor = (similarity: number) => {
    if (similarity >= 0.9) return "bg-success/10 text-success";
    if (similarity >= 0.8) return "bg-primary/10 text-primary";
    if (similarity >= 0.7) return "bg-secondary/10 text-secondary";
    return "bg-accent/10 text-accent";
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Vector Similarity Search</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>AI-powered search to find customers with similar characteristics. Uses vector embeddings to match demographics, professions, locations, and other traits from natural language queries.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Advanced
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Adjust similarity threshold and result limits for more precise matching</p>
            </TooltipContent>
          </Tooltip>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Label htmlFor="search-input">Search Query</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Describe the type of customer you're looking for using natural language. For example: "professional in Jakarta", "young entrepreneur", or "high-value female customer".</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <Input
                id="search-input"
                data-testid="input-search-query"
                placeholder="Search customers by traits: professional, young male, Jakarta entrepreneur, high value..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-12"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          <div className="flex flex-wrap gap-2">
            {['premium high-value customer', 'standard customer middle tier', 'budget conscious basic customer', 'professional male John', 'female professional Jane'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setSearchQuery(suggestion)}
                className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <Button
            onClick={handleSearch}
            disabled={isLoading || !searchQuery.trim()}
            className="w-full"
            data-testid="button-search-similar"
          >
            <Search className="w-4 h-4 mr-2" />
            Search Similar Customers
          </Button>
        </div>

        {/* Advanced Options */}
        {isAdvancedOpen && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Similarity Threshold: {filters.threshold}%</Label>
                <div className="relative mt-2">
                  <Slider
                    value={[filters.threshold]}
                    onValueChange={(value) => updateFilter('threshold', value[0])}
                    max={100}
                    min={0}
                    step={1}
                    data-testid="slider-threshold"
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={filters.threshold}
                    onChange={(e) => updateFilter('threshold', parseInt(e.target.value))}
                    data-testid="input-threshold"
                    className="sr-only"
                    aria-label="Similarity threshold"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="resultLimit">Results Limit</Label>
                <Select value={filters.resultLimit.toString()} onValueChange={(value) => updateFilter('resultLimit', parseInt(value))}>
                  <SelectTrigger className="mt-2" data-testid="select-result-limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Searching for similar customers...</p>
          </div>
        )}

        {/* Search Results */}
        {results.length > 0 && !isLoading && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">
              Similar Customers Found ({results.length})
            </h4>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.map((customer) => (
                <div
                  key={customer.customerId}
                  className="flex items-center justify-between bg-card border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => viewCustomerDetails(customer)}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar className={`w-10 h-10 ${getAvatarColor(customer.similarity)}`}>
                      <AvatarFallback>
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
                      <div className="text-xs text-muted-foreground">
                        {customer.customerSegment && `${customer.customerSegment} • `}
                        {customer.lifetimeValue && `LTV: $${Number(customer.lifetimeValue).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewCustomerDetails(customer);
                      }}
                      className="h-8"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">
                        {(customer.similarity * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Similarity
                      </div>
                    </div>
                    <Progress
                      value={customer.similarity * 100}
                      className="w-16"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {results.length === 0 && !isLoading && searchQuery && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No similar customers found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search terms or lowering the similarity threshold
            </p>
          </div>
        )}

        {/* Initial State */}
        {results.length === 0 && !isLoading && !searchQuery && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Discover similar customers</p>
            <p className="text-sm text-muted-foreground">
              Use semantic search to find customers with similar demographics, professions, or locations from your customer database
            </p>
          </div>
        )}

        {/* Customer Details Modal */}
        <Dialog open={isDetailModalOpen} onOpenChange={closeCustomerDetails}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Details - {selectedCustomer?.firstName} {selectedCustomer?.lastName}
              </DialogTitle>
            </DialogHeader>

            {selectedCustomer && (
              <div className="space-y-6">
                {/* Customer ID & Core Identifiers */}
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-sm text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-3">Customer Core Identity</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <strong>Customer ID:</strong>
                      <span className="font-mono text-xs ml-2 text-muted-foreground">{selectedCustomer.customerId}</span>
                    </div>
                    <div>
                      <strong>Primary Email:</strong> {selectedCustomer.email || 'N/A'}
                    </div>
                    <div>
                      <strong>Full Name:</strong> {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </div>
                    <div>
                      <strong>Phone Number:</strong> {selectedCustomer.phoneNumber || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>Name:</strong> {selectedCustomer.firstName} {selectedCustomer.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          <strong>Email:</strong> {selectedCustomer.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          <strong>Phone:</strong> {selectedCustomer.phoneNumber || 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>Birth Date:</strong> {formatDate(selectedCustomer.dateOfBirth || null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          <strong>Gender:</strong> {selectedCustomer.gender || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Business Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedCustomer.customerSegment}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>Lifetime Value:</strong> {formatCurrency(selectedCustomer.lifetimeValue)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          <strong>Data Quality:</strong> {selectedCustomer.dataQualityScore}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          <strong>Last Active:</strong> {formatDate(selectedCustomer.lastActiveAt || null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          <strong>Similarity Score:</strong> {(selectedCustomer.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Information */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Location & Address Details
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-3">
                    {selectedCustomer.currentAddress && typeof selectedCustomer.currentAddress === 'object' ? (
                      <div className="space-y-2">
                        <div className="text-sm">
                          <strong>City:</strong> {(selectedCustomer.currentAddress as any)?.city || 'N/A'}
                        </div>
                        <div className="text-sm">
                          <strong>Country:</strong> {(selectedCustomer.currentAddress as any)?.country || 'N/A'}
                        </div>
                        {(selectedCustomer.currentAddress as any)?.state && (
                          <div className="text-sm">
                            <strong>State/Province:</strong> {(selectedCustomer.currentAddress as any).state}
                          </div>
                        )}
                        {(selectedCustomer.currentAddress as any)?.postalCode && (
                          <div className="text-sm">
                            <strong>Postal Code:</strong> {(selectedCustomer.currentAddress as any).postalCode}
                          </div>
                        )}
                        {(selectedCustomer.currentAddress as any)?.street && (
                          <div className="text-sm">
                            <strong>Street:</strong> {(selectedCustomer.currentAddress as any).street}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          <strong>Full Address Data:</strong>
                          <pre className="text-xs bg-background p-2 rounded border mt-1 max-h-20 overflow-y-auto">
                            {JSON.stringify(selectedCustomer.currentAddress, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No address information available</div>
                    )}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Account Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Created:</strong> {formatDate(selectedCustomer.createdAt || null)}
                    </div>
                    <div>
                      <strong>Updated:</strong> {formatDate(selectedCustomer.updatedAt || null)}
                    </div>
                  </div>
                </div>

                {/* Customer Identifiers */}
                {selectedCustomer.identifiers && selectedCustomer.identifiers.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Hash className="w-4 h-4" />
                      Customer Identifiers
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedCustomer.identifiers.map((identifier, index) => (
                        <div key={index} className="bg-muted/50 rounded-lg p-3">
                          <div className="text-sm font-medium">{identifier.identifierType}</div>
                          <div className="text-xs text-muted-foreground truncate">{identifier.identifierValue}</div>
                          {identifier.sourceSystem && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Source: {identifier.sourceSystem}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Lineage */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Data Lineage & Source Tracking
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Import ID:</strong> {selectedCustomer.importId || 'N/A'}
                      </div>
                      <div>
                        <strong>Source Row:</strong> {selectedCustomer.sourceRowNumber || 'N/A'}
                      </div>
                    </div>
                    {selectedCustomer.sourceFileHash && (
                      <div className="text-sm">
                        <strong>File Hash:</strong>
                        <span className="font-mono text-xs ml-2 text-muted-foreground">
                          {selectedCustomer.sourceFileHash.substring(0, 16)}...
                        </span>
                      </div>
                    )}
                    {selectedCustomer.dataLineage && (
                      <div className="text-sm">
                        <strong>Field Sources:</strong>
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          <pre className="text-xs bg-background p-2 rounded border">
                            {JSON.stringify(selectedCustomer.dataLineage, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vector Embedding Information */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Vector Embedding Analysis
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Match Confidence</span>
                      <span className="text-lg font-bold">{(selectedCustomer.similarity * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={selectedCustomer.similarity * 100} className="mb-2" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Embedding Type:</strong> {selectedCustomer.embeddingType || 'customer_profile'}
                      </div>
                      <div>
                        <strong>Generated:</strong> {selectedCustomer.lastGeneratedAt ? formatDate(selectedCustomer.lastGeneratedAt) : 'N/A'}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      This customer matches your search criteria based on AI-generated vector embeddings that capture demographic patterns,
                      professional backgrounds, and behavioral characteristics from your authentic customer database.
                    </p>
                  </div>
                </div>

                {/* Activity & Engagement */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Professional & Business Details
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {selectedCustomer.customerSegment && (
                        <div>
                          <strong>Professional Segment:</strong>
                          <Badge variant="secondary" className="ml-2">{selectedCustomer.customerSegment}</Badge>
                        </div>
                      )}
                      <div>
                        <strong>Data Quality Score:</strong> {selectedCustomer.dataQualityScore}%
                      </div>
                    </div>

                    {selectedCustomer.currentAddress && typeof selectedCustomer.currentAddress === 'object' && (
                      <div className="mt-3">
                        <strong>Geographic Profile:</strong>
                        <div className="mt-1 text-sm text-muted-foreground">
                          📍 {(selectedCustomer.currentAddress as any)?.city || 'Unknown City'}, {(selectedCustomer.currentAddress as any)?.country || 'Indonesia'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Complete Customer Data Table */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Data Lengkap Customer (Semua Field)
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-3">
                      Tabel lengkap menampilkan semua data customer dari database:
                    </div>
                    <div className="max-h-80 overflow-y-auto border rounded">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3 font-semibold">Field</TableHead>
                            <TableHead className="font-semibold">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(selectedCustomer).map(([key, value]) => (
                            <TableRow key={key} className="hover:bg-muted/30">
                              <TableCell className="font-medium text-sm bg-muted/20">
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                              </TableCell>
                              <TableCell className="text-sm">
                                {value === null || value === undefined ? (
                                  <span className="text-muted-foreground italic">N/A</span>
                                ) : typeof value === 'object' ? (
                                  <div className="max-w-md">
                                    <pre className="text-xs bg-background p-2 rounded border whitespace-pre-wrap overflow-auto max-h-20">
                                      {JSON.stringify(value, null, 2)}
                                    </pre>
                                  </div>
                                ) : typeof value === 'boolean' ? (
                                  <Badge variant={value ? "default" : "secondary"}>
                                    {value ? "Ya" : "Tidak"}
                                  </Badge>
                                ) : typeof value === 'number' ? (
                                  <span className="font-mono">{value.toLocaleString()}</span>
                                ) : value.toString().length > 50 ? (
                                  <div>
                                    <div className="truncate max-w-xs" title={value.toString()}>
                                      {value.toString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Klik untuk melihat lengkap
                                    </div>
                                  </div>
                                ) : (
                                  <span>{value.toString()}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                {/* Customer Events Preview */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Customer Activity & Events
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="text-sm">
                      <strong>Customer ID for Events:</strong> {selectedCustomer.customerId}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      This customer's events and activities can be queried using the customer ID above.
                      All interaction data, timestamps, and behavioral patterns are tracked in the customer events system.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
      </Card>
    </TooltipProvider>
  );
});

export default VectorSearchPanel;

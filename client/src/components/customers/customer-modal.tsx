import { useState, useEffect, memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Customer } from "@shared/schema";
import { createCustomer, updateCustomer, getCustomerEvents } from "@/lib/api";
import { Clock, Database, FileText, Activity } from "lucide-react";
import AddressDisplay from "./address-display";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  mode: "create" | "edit" | "view";
}

const segments = [
  "High Value",
  "Frequent Buyer",
  "New Customer",
  "At Risk",
  "Inactive"
];

// Utility function to render JSON data in a user-friendly table format
const renderJsonTable = (data: any, title: string): JSX.Element | null => {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return null;
  }

  const flattenObject = (obj: any, prefix = ''): Array<{key: string, value: any}> => {
    const items: Array<{key: string, value: any}> = [];

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        items.push(...flattenObject(value, newKey));
      } else {
        items.push({
          key: newKey,
          value: Array.isArray(value) ? value.join(', ') : value
        });
      }
    }

    return items;
  };

  const items = flattenObject(data);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Field</TableHead>
                <TableHead className="font-medium">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(({ key, value }, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-sm">{key}</TableCell>
                  <TableCell className="break-all">
                    {value !== null && value !== undefined ? String(value) : <span className="text-muted-foreground italic">Not specified</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// Utility function to format dates
const formatDate = (date: string | Date | null | undefined) => {
  if (!date) return <span className="text-muted-foreground italic">Not specified</span>;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const CustomerModal = memo<CustomerModalProps>(function CustomerModal({ isOpen, onClose, customer, mode }) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    gender: "",
    customerSegment: "",
    lifetimeValue: "",
    dataQualityScore: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load customer events if viewing/editing existing customer
  const { data: events } = useQuery({
    queryKey: ["/api/customers", customer?.id, "events"],
    queryFn: () => customer ? getCustomerEvents(customer.id) : Promise.resolve([]),
    enabled: !!customer && mode !== "create",
  });

  // Create customer mutation
  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      toast({ title: "Customer created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Error creating customer", description: error.message, variant: "destructive" });
    },
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCustomer(id, data),
    onSuccess: () => {
      toast({ title: "Customer updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Error updating customer", description: error.message, variant: "destructive" });
    },
  });

  // Load customer data when modal opens
  useEffect(() => {
    if (customer && mode !== "create") {
      setFormData({
        firstName: customer.firstName || "",
        lastName: customer.lastName || "",
        email: customer.email || "",
        phoneNumber: customer.phoneNumber || "",
        dateOfBirth: customer.dateOfBirth ? String(customer.dateOfBirth).substring(0, 10) : "",
        gender: customer.gender || "",
        customerSegment: customer.customerSegment || "",
        lifetimeValue: customer.lifetimeValue?.toString() || "",
        dataQualityScore: customer.dataQualityScore?.toString() || "",
      });
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phoneNumber: "",
        dateOfBirth: "",
        gender: "",
        customerSegment: "",
        lifetimeValue: "",
        dataQualityScore: "",
      });
    }
  }, [customer, mode, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const optionalStringFields = ["lastName", "email", "phoneNumber", "dateOfBirth", "gender", "customerSegment"] as const;
    const submitData: Record<string, string | number | undefined> = {
      firstName: formData.firstName,
    };
    for (const field of optionalStringFields) {
      const val = formData[field].trim();
      if (val !== "") {
        submitData[field] = val;
      }
    }
    if (formData.lifetimeValue) {
      submitData.lifetimeValue = parseFloat(formData.lifetimeValue);
    }
    if (formData.dataQualityScore) {
      submitData.dataQualityScore = parseFloat(formData.dataQualityScore);
    }

    if (mode === "create") {
      createMutation.mutate(submitData);
    } else if (mode === "edit" && customer) {
      updateMutation.mutate({ id: customer.id, data: submitData });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isReadOnly = mode === "view";
  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add New Customer" :
             mode === "edit" ? "Edit Customer" : "Customer Profile"}
          </DialogTitle>
        </DialogHeader>

        {mode === "view" ? (
          // View mode - comprehensive customer profile display
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="unstructured">Data Fields</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">First Name</Label>
                        <p className="text-sm">{customer?.firstName || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Last Name</Label>
                        <p className="text-sm">{customer?.lastName || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email Address</Label>
                      <p className="text-sm">{customer?.email || <span className="text-muted-foreground italic">Not specified</span>}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Phone Number</Label>
                      <p className="text-sm">{customer?.phoneNumber || <span className="text-muted-foreground italic">Not specified</span>}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Date of Birth</Label>
                        <p className="text-sm">{formatDate(customer?.dateOfBirth)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Gender</Label>
                        <p className="text-sm">{customer?.gender || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Customer Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Customer Segment</Label>
                      <div className="text-sm">
                        {customer?.customerSegment ? (
                          <Badge variant="secondary">{customer.customerSegment}</Badge>
                        ) : (
                          <span className="text-muted-foreground italic">Not specified</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Lifetime Value</Label>
                      <p className="text-sm font-mono">
                        {customer?.lifetimeValue ? `$${customer.lifetimeValue.toLocaleString()}` : <span className="text-muted-foreground italic">Not specified</span>}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Data Quality Score</Label>
                      {customer?.dataQualityScore ? (
                        <div className="mt-2">
                          <div className="flex items-center space-x-3">
                            <Progress value={customer.dataQualityScore} className="flex-1" />
                            <span className="text-sm font-medium">{customer.dataQualityScore.toFixed(1)}%</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Not specified</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Last Active</Label>
                      <p className="text-sm">{formatDate(customer?.lastActiveAt)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <AddressDisplay
                  address={customer?.currentAddress}
                  title="Current Address"
                  showOriginal={true}
                />

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Timestamps
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Created At</Label>
                        <p className="text-sm">{formatDate(customer?.createdAt)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Updated At</Label>
                        <p className="text-sm">{formatDate(customer?.updatedAt)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="unstructured" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                {customer?.unmappedFields ? renderJsonTable(customer.unmappedFields as any, "Unmapped Fields") : null}
                {customer?.originalSourceData ? renderJsonTable(customer.originalSourceData as any, "Original Source Data") : null}
                {customer?.fieldMappingMetadata ? renderJsonTable(customer.fieldMappingMetadata as any, "Field Mapping Metadata") : null}
                {customer?.dataLineage ? renderJsonTable(customer.dataLineage as any, "Data Lineage") : null}

                {!customer?.unmappedFields && !customer?.originalSourceData && !customer?.fieldMappingMetadata && !customer?.dataLineage && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No unstructured data available for this customer.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activities" className="space-y-6">
              {events && events.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Recent Activities ({events.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <div className="space-y-3">
                        {events.map((event: any) => (
                          <div key={event.id} className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                            <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">{event.eventType}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(event.eventTimestamp).toLocaleString()}
                                {event.source && ` • ${event.source}`}
                              </div>
                              {event.eventProperties && (
                                <div className="mt-2">
                                  {renderJsonTable(event.eventProperties, "Event Properties")}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No activities recorded for this customer.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="metadata" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      System Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Customer ID</Label>
                        <p className="text-sm font-mono">{customer?.id}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Import ID</Label>
                        <p className="text-sm font-mono">{customer?.importId || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Source Row Number</Label>
                        <p className="text-sm">{customer?.sourceRowNumber || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Source File Hash</Label>
                        <p className="text-sm font-mono break-all">{customer?.sourceFileHash || <span className="text-muted-foreground italic">Not specified</span>}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          // Edit/Create mode - existing form layout
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleInputChange("gender", value)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="customerSegment">Customer Segment</Label>
                  <Select
                    value={formData.customerSegment}
                    onValueChange={(value) => handleInputChange("customerSegment", value)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((segment) => (
                        <SelectItem key={segment} value={segment}>
                          {segment}
                        </SelectItem>
                      ))}
                      {formData.customerSegment && !segments.includes(formData.customerSegment) && (
                        <SelectItem key={formData.customerSegment} value={formData.customerSegment}>
                          {formData.customerSegment}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="lifetimeValue">Lifetime Value ($)</Label>
                  <Input
                    id="lifetimeValue"
                    type="number"
                    step="0.01"
                    value={formData.lifetimeValue}
                    onChange={(e) => handleInputChange("lifetimeValue", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="dataQualityScore">Data Quality Score (%)</Label>
                  <Input
                    id="dataQualityScore"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.dataQualityScore}
                    onChange={(e) => handleInputChange("dataQualityScore", e.target.value)}
                    disabled={isReadOnly}
                    className="mt-1"
                  />
                  {formData.dataQualityScore && (
                    <div className="mt-2 flex items-center space-x-3">
                      <Progress value={parseFloat(formData.dataQualityScore)} className="flex-1" />
                      <span className="text-sm text-success font-medium">
                        {parseFloat(formData.dataQualityScore).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {mode === "view" ? "Close" : "Cancel"}
          </Button>
          {mode !== "view" && (
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : mode === "create" ? "Create Customer" : "Update Customer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default CustomerModal;

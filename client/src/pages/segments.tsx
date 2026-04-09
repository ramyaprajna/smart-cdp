import { useState, useMemo, memo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Users, Plus, TrendingUp, MapPin, DollarSign, HelpCircle, Edit, Trash2, X, RefreshCw, Brain } from "lucide-react";
import { createSegment } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useModal } from "@/hooks/use-modal";
import { useFormState } from "@/hooks/use-form-state";
import { useSegments } from "@/hooks/use-segments";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import RefreshPerformanceMonitor from "@/components/segments/refresh-performance-monitor";
import { EditSegmentModal } from "@/components/segments/edit-segment-modal";
import { AiSegmentModal } from "@/components/segments/ai-segment-modal";

// Define form data interface for better type safety
interface SegmentFormData {
  name: string;
  description: string;
  criteria: object;
}

const INITIAL_FORM_DATA: SegmentFormData = {
  name: "",
  description: "",
  criteria: {},
};

export default memo(function Segments() {
  // Use custom hooks for cleaner state management with CDP refresh capabilities
  const {
    segments,
    isLoading,
    customerStats,
    refreshSegmentData,
    isRefreshing,
    refreshPerformance,
    lastRefresh,
    dataQuality
  } = useSegments();
  const {
    isOpen: isCreateModalOpen,
    openModal: openCreateModal,
    closeModal: closeCreateModal
  } = useModal();

  const {
    isOpen: isEditModalOpen,
    selectedItem: editingSegment,
    openEditModal,
    closeModal: closeEditModal
  } = useModal<any>();

  const {
    isOpen: isAiModalOpen,
    openModal: openAiModal,
    closeModal: closeAiModal
  } = useModal<any>();

  const {
    formData,
    isSubmitting,
    errors,
    updateField,
    resetForm,
    setSubmitting,
    setErrors
  } = useFormState<SegmentFormData>(INITIAL_FORM_DATA);

  const [criteriaRules, setCriteriaRules] = useState<Array<{
    id: string;
    field: string;
    operator: string;
    value: string;
  }>>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for creating segments with improved error handling
  const createMutation = useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      toast({ title: "Segment created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });
      closeCreateModal();
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating segment", description: error.message, variant: "destructive" });
    },
  });

  // CDP-optimized update segment mutation with auto-refresh
  const handleUpdateSegment = useCallback(async (segmentId: string, updateData: any) => {
    // Validate segmentId is a proper UUID before making API call
    if (!segmentId || typeof segmentId !== 'string') {
      throw new Error(`Invalid segment ID: ${segmentId}`);
    }
    
    try {
      // Update segment via PATCH API using correct apiRequest signature
      await apiRequest('PATCH', `/api/segments/${segmentId}`, updateData);

      // Invalidate queries for immediate UI update
      queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/segment-distribution"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/stats"] });

      // Trigger comprehensive refresh for updated metrics
      const refreshMetrics = await refreshSegmentData();

      toast({
        title: "Segment Updated",
        description: `Parameters saved and data refreshed in ${refreshMetrics.duration}ms`
      });

    } catch (error) {
      console.error('[CDP Error] Segment update failed:', error);
      throw error;
    }
  }, [queryClient, refreshSegmentData, toast]);

  // Event handlers using hooks
  const handleOpenCreateModal = useCallback(() => {
    resetForm();
    openCreateModal("create");
  }, [resetForm, openCreateModal]);

  // CDP-optimized refresh handler with evidence-based performance tracking
  const handleRefreshData = useCallback(async () => {
    try {
      const performance_metrics = await refreshSegmentData();

      // Show success toast with performance evidence
      toast({
        title: "Segment data refreshed successfully",
        description: `Updated ${performance_metrics.recordsProcessed} records in ${performance_metrics.duration}ms`
      });

      // Log evidence for CDP best practices validation

    } catch (error) {
      toast({
        title: "Error refreshing segment data",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });

      console.error('[CDP Error] Refresh failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }, [refreshSegmentData, toast, dataQuality]);

  const handleOpenEditModal = useCallback((segment: any) => {
    // Ensure we're passing the complete segment object with proper ID
    if (!segment?.id) {
      console.error('[CDP Error] Invalid segment passed to edit modal:', segment);
      toast({
        title: "Error",
        description: "Cannot edit segment: invalid data",
        variant: "destructive"
      });
      return;
    }
    openEditModal(segment);
  }, [openEditModal, toast]);

  const addCriteriaRule = () => {
    const newRule = {
      id: Date.now().toString(),
      field: "",
      operator: "",
      value: ""
    };
    setCriteriaRules([...criteriaRules, newRule]);
  };

  const removeCriteriaRule = (id: string) => {
    setCriteriaRules(criteriaRules.filter(rule => rule.id !== id));
  };

  const updateCriteriaRule = (id: string, field: string, value: any) => {
    setCriteriaRules(criteriaRules.map(rule => {
      if (rule.id === id) {
        const updatedRule = { ...rule, [field]: value };

        // Reset operator and value when field changes to ensure compatibility
        if (field === 'field') {
          // Smart default: auto-select "contains" for location fields
          if (isLocationField(value)) {
            updatedRule.operator = 'contains';
          } else {
            updatedRule.operator = '';
          }
          updatedRule.value = '';
        }

        return updatedRule;
      }
      return rule;
    }));
  };

  // Smart detection for location-related fields
  const isLocationField = (fieldName: string) => {
    const locationFields = ['city', 'province', 'country', 'postalCode'];
    const locationPrefixes = ['unmapped_fields.domisili', 'unmapped_fields.alamat', 'unmapped_fields.kota'];
    
    return locationFields.includes(fieldName) || 
           locationPrefixes.some(prefix => fieldName.startsWith(prefix)) ||
           fieldName.toLowerCase().includes('location') ||
           fieldName.toLowerCase().includes('address');
  };

  const getFieldType = (fieldName: string) => {
    const numericFields = ['age', 'lifetimeValue', 'dataQualityScore', 'totalPurchases', 'avgOrderValue', 'engagementScore', 'loyaltyPoints', 'preferenceScore', 'churnRisk', 'similarityScore', 'sourceRowNumber', 'socialMediaCount'];
    const textFields = ['firstName', 'lastName', 'email', 'phoneNumber', 'city', 'province', 'country', 'postalCode', 'profession', 'company', 'jobTitle', 'industry', 'importSource', 'sourceFileHash', 'instagramUsername', 'facebookUsername', 'twitterUsername', 'linkedinProfile'];
    const categoryFields = ['gender', 'customerSegment', 'behaviorCluster', 'recommendationCategory', 'embeddingVersion', 'hasInstagram'];
    const dateFields = ['dateOfBirth', 'lastActiveAt', 'createdAt', 'updatedAt'];
    const existenceFields = ['emailExists', 'phoneExists'];

    if (numericFields.includes(fieldName)) return 'numeric';
    if (textFields.includes(fieldName)) return 'text';
    if (categoryFields.includes(fieldName)) return 'category';
    if (dateFields.includes(fieldName)) return 'date';
    if (existenceFields.includes(fieldName)) return 'existence';
    return 'text'; // default
  };

  const getConditionsForField = (fieldName: string) => {
    const fieldType = getFieldType(fieldName);
    const isLocation = isLocationField(fieldName);

    // Special handling for existence-based fields
    if (fieldName === 'emailExists' || fieldName === 'phoneExists') {
      return [
        { value: 'exists', label: 'Has Value' },
        { value: 'not_exists', label: 'Does Not Have Value' }
      ];
    }

    switch (fieldType) {
      case 'numeric':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'greater_than', label: 'Greater than' },
          { value: 'less_than', label: 'Less than' },
          { value: 'between', label: 'Between' }
        ];
      case 'text':
        // Prioritize "contains" for location fields
        if (isLocation) {
          return [
            { value: 'contains', label: 'Contains (Recommended)' },
            { value: 'equals', label: 'Exact Match' },
            { value: 'starts_with', label: 'Starts with' },
            { value: 'ends_with', label: 'Ends with' },
            { value: 'exists', label: 'Has Value' },
            { value: 'not_exists', label: 'Does Not Have Value' }
          ];
        }
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'starts_with', label: 'Starts with' },
          { value: 'ends_with', label: 'Ends with' },
          { value: 'exists', label: 'Has Value' },
          { value: 'not_exists', label: 'Does Not Have Value' }
        ];
      case 'category':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'not_equals', label: 'Not equals' }
        ];
      case 'date':
        return [
          { value: 'equals', label: 'On date' },
          { value: 'greater_than', label: 'After' },
          { value: 'less_than', label: 'Before' },
          { value: 'between', label: 'Between dates' }
        ];
      default:
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'contains', label: 'Contains' }
        ];
    }
  };

  const getValuePlaceholder = (fieldName: string, operator: string) => {
    const fieldType = getFieldType(fieldName);
    const isLocation = isLocationField(fieldName);

    if (operator === 'between') {
      if (fieldType === 'numeric') return 'e.g., 100-500';
      if (fieldType === 'date') return 'e.g., 2023-01-01 to 2023-12-31';
    }

    // Enhanced placeholders for location fields
    if (isLocation) {
      if (operator === 'contains') return 'e.g., Jakarta (finds Jakarta Barat, Jakarta Selatan, etc.)';
      if (operator === 'equals') return 'e.g., Jakarta Barat (exact match only)';
    }

    switch (fieldType) {
      case 'numeric':
        return fieldName === 'age' ? 'e.g., 25' :
               fieldName === 'lifetimeValue' ? 'e.g., 1000' :
               fieldName === 'dataQualityScore' ? 'e.g., 90' : 'Enter number';
      case 'text':
        return fieldName === 'email' ? 'e.g., @gmail.com' :
               fieldName === 'city' ? 'e.g., Jakarta' :
               fieldName === 'profession' ? 'e.g., Engineer' :
               fieldName === 'instagramUsername' ? 'e.g., ranggaayudhanto' :
               fieldName === 'facebookUsername' ? 'e.g., john.doe' :
               fieldName === 'twitterUsername' ? 'e.g., @johndoe' :
               fieldName === 'linkedinProfile' ? 'e.g., linkedin.com/in/johndoe' : 'Enter text';
      case 'category':
        return fieldName === 'gender' ? 'e.g., Male, Female' :
               fieldName === 'customerSegment' ? 'e.g., Professional' : 'Enter category';
      case 'date':
        return 'e.g., 2023-01-01';
      default:
        return 'Enter value';
    }
  };

  const getCategoryOptions = (fieldName: string) => {
    switch (fieldName) {
      case 'gender':
        return ['Male', 'Female'];
      case 'customerSegment':
        return ['Professional', 'Student', 'Entrepreneur', 'Regular Listener'];
      case 'behaviorCluster':
        return ['High Engagement', 'Medium Engagement', 'Low Engagement', 'New User'];
      case 'recommendationCategory':
        return ['Premium', 'Standard', 'Basic'];
      case 'embeddingVersion':
        return ['v1.0', 'v2.0', 'v3.0'];
      case 'hasInstagram':
        return ['Yes', 'No'];
      default:
        return [];
    }
  };

  const buildCriteriaJSON = () => {
    if (criteriaRules.length === 0) return {};

    const criteria: any = {};
    criteriaRules.forEach(rule => {
      // Handle existence checks (don't require value)
      if (rule.field && rule.operator && (rule.operator === 'exists' || rule.operator === 'not_exists')) {
        criteria[rule.field] = { [rule.operator === 'exists' ? '$exists' : '$not_exists']: true };
        return;
      }

      if (rule.field && rule.operator && rule.value) {
        const numericValue = isNaN(Number(rule.value)) ? rule.value : Number(rule.value);

        switch (rule.operator) {
          case 'equals':
            criteria[rule.field] = numericValue;
            break;
          case 'greater_than':
            criteria[rule.field] = { $gt: numericValue };
            break;
          case 'less_than':
            criteria[rule.field] = { $lt: numericValue };
            break;
          case 'contains':
            criteria[rule.field] = { $regex: rule.value };
            break;
          case 'starts_with':
            criteria[rule.field] = { $regex: `^${rule.value}` };
            break;
          case 'ends_with':
            criteria[rule.field] = { $regex: `${rule.value}$` };
            break;
          case 'not_equals':
            criteria[rule.field] = { $ne: numericValue };
            break;
          case 'between':
            // Handle range values (e.g., "100-500" or "2023-01-01 to 2023-12-31")
            const rangeParts = rule.value.toString().split(/[-\s]+to\s+|[-]/);
            if (rangeParts.length === 2) {
              const [min, max] = rangeParts.map(part => isNaN(Number(part)) ? part : Number(part));
              criteria[rule.field] = { $gte: min, $lte: max };
            }
            break;
        }
      }
    });
    return criteria;
  };

  const renderFieldOptions = () => (
    <>
      {/* Demographics */}
      <SelectItem value="age">Age</SelectItem>
      <SelectItem value="gender">Gender</SelectItem>
      <SelectItem value="dateOfBirth">Date of Birth</SelectItem>

      {/* Customer Profile */}
      <SelectItem value="firstName">First Name</SelectItem>
      <SelectItem value="lastName">Last Name</SelectItem>
      <SelectItem value="email">Email</SelectItem>
      <SelectItem value="phoneNumber">Phone Number</SelectItem>
      <SelectItem value="emailExists">Email Exists</SelectItem>
      <SelectItem value="phoneExists">Phone Exists</SelectItem>
      <SelectItem value="customerSegment">Customer Type</SelectItem>

      {/* Location Data */}
      <SelectItem value="unmapped_fields.domisili">City (Location)</SelectItem>
      <SelectItem value="province">Province</SelectItem>
      <SelectItem value="country">Country</SelectItem>
      <SelectItem value="postalCode">Postal Code</SelectItem>

      {/* Business Metrics */}
      <SelectItem value="lifetimeValue">Lifetime Value</SelectItem>
      <SelectItem value="dataQualityScore">Data Quality Score</SelectItem>
      <SelectItem value="lastActiveAt">Last Active Date</SelectItem>

      {/* Professional Data */}
      <SelectItem value="profession">Profession</SelectItem>
      <SelectItem value="company">Company</SelectItem>
      <SelectItem value="jobTitle">Job Title</SelectItem>
      <SelectItem value="industry">Industry</SelectItem>

      {/* Engagement Metrics */}
      <SelectItem value="totalPurchases">Total Purchases</SelectItem>
      <SelectItem value="avgOrderValue">Average Order Value</SelectItem>
      <SelectItem value="engagementScore">Engagement Score</SelectItem>
      <SelectItem value="loyaltyPoints">Loyalty Points</SelectItem>

      {/* Vector/AI Data Fields */}
      <SelectItem value="behaviorCluster">Behavior Cluster</SelectItem>
      <SelectItem value="preferenceScore">Preference Score</SelectItem>
      <SelectItem value="churnRisk">Churn Risk</SelectItem>
      <SelectItem value="recommendationCategory">Recommendation Category</SelectItem>
      <SelectItem value="similarityScore">Similarity Score</SelectItem>
      <SelectItem value="embeddingVersion">Embedding Version</SelectItem>

      {/* Social Media Data */}
      <SelectItem value="instagramUsername">Instagram Username</SelectItem>
      <SelectItem value="hasInstagram">Has Instagram Account</SelectItem>
      <SelectItem value="facebookUsername">Facebook Username</SelectItem>
      <SelectItem value="twitterUsername">Twitter Username</SelectItem>
      <SelectItem value="linkedinProfile">LinkedIn Profile</SelectItem>
      <SelectItem value="socialMediaCount">Social Media Accounts Count</SelectItem>

      {/* Data Lineage & Source */}
      <SelectItem value="importSource">Import Source</SelectItem>
      <SelectItem value="sourceRowNumber">Source Row Number</SelectItem>
      <SelectItem value="sourceFileHash">Source File Hash</SelectItem>
      <SelectItem value="createdAt">Registration Date</SelectItem>
      <SelectItem value="updatedAt">Last Updated</SelectItem>
    </>
  );


  // Removed redundant updateMutation - using handleUpdateSegment instead

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const criteria = buildCriteriaJSON();
    setSubmitting(true);

    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      criteria,
      isActive: true,
    });
  }, [formData, buildCriteriaJSON, setSubmitting, createMutation]);

  return (
    <>
      <div className="px-6 py-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customer Segments</h1>
            <p className="text-muted-foreground">Organize customers into targeted groups for better analytics and engagement</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => openAiModal('create')}
              className="flex items-center gap-2"
              variant="outline"
              data-testid="button-create-segment-ai"
              aria-describedby="ai-create-help"
            >
              <Brain className="h-4 w-4" />
              Create Segment with AI
            </Button>
            <div id="ai-create-help" className="sr-only">
              Use AI assistance to create customer segments based on natural language descriptions
            </div>
            <Button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2"
              data-testid="button-create-segment"
              aria-describedby="create-help"
            >
              <Plus className="h-4 w-4" />
              Create Segment
            </Button>
            <div id="create-help" className="sr-only">
              Open dialog to create a new customer segment
            </div>
          </div>
        </div>
      </div>

      {/* CDP Performance Dashboard - Always show refresh controls */}
      <div className="px-6 py-2 bg-muted/30 border-b">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              Data Quality: <span className="font-medium text-foreground">
                {dataQuality.analyticsSegments} analytics + {dataQuality.customSegments} custom segments
              </span>
            </span>
            <span className="text-muted-foreground">
              Total Customers: <span className="font-medium text-foreground">
                {Number.isFinite(dataQuality.totalCustomers) ? dataQuality.totalCustomers.toLocaleString() : '—'}
              </span>
            </span>
            {refreshPerformance && (
              <span className="text-xs text-muted-foreground px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded">
                Last refresh: {refreshPerformance.duration}ms ({refreshPerformance.recordsProcessed} records)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Last refresh: {(() => { const d = new Date(lastRefresh); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString() : 'Never'; })()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className="h-7"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </div>
      </div>

      {/* Evidence-Based Performance Monitoring */}
      {refreshPerformance && (
        <div className="px-6 pt-4">
          <RefreshPerformanceMonitor
            performance={refreshPerformance}
            className="mb-4"
          />
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {segments?.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No segments yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first customer segment to start organizing your audience
                </p>
                <Button onClick={handleOpenCreateModal}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Segment
                </Button>
              </div>
            ) : (
              segments?.map((segment: any) => (
                <TooltipProvider key={segment.id}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{segment.name}</CardTitle>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="max-w-xs space-y-1">
                                <p className="font-medium">Customer Segment</p>
                                <p className="text-sm">{segment.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  Authentic customer data from your imported records
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(segment)}
                            className="h-7 w-7 p-0"
                            aria-label={`Edit ${segment.name} segment`}
                            data-testid={`button-edit-segment-${segment.id}`}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Badge variant={segment.isActive ? "default" : "secondary"}>
                            {segment.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        {segment.description}
                      </p>

                      {/* Customer Count and Activity */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-blue-500" />
                          <div>
                            <span className="text-sm font-medium block">
                              {Number.isFinite(segment.customerCount) ? segment.customerCount.toLocaleString() : '—'}
                            </span>
                            <span className="text-xs text-muted-foreground">customers</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <div>
                            <span className="text-sm font-medium block">
                              {Number.isFinite(segment.activityRate) ? segment.activityRate : '—'}%
                            </span>
                            <span className="text-xs text-muted-foreground">active</span>
                          </div>
                        </div>
                      </div>

                      {/* Lifetime Value and Data Quality */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center space-x-2">
                          <DollarSign className="w-4 h-4 text-emerald-500" />
                          <div>
                            <span className="text-sm font-medium block">
                              ${typeof segment.avgLifetimeValue === 'number' && Number.isFinite(segment.avgLifetimeValue) ? segment.avgLifetimeValue.toFixed(0) : '—'}
                            </span>
                            <span className="text-xs text-muted-foreground">avg LTV</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                          <div>
                            <span className="text-sm font-medium block">
                              {typeof segment.avgDataQuality === 'number' && Number.isFinite(segment.avgDataQuality) ? segment.avgDataQuality.toFixed(1) : '—'}%
                            </span>
                            <span className="text-xs text-muted-foreground">quality</span>
                          </div>
                        </div>
                      </div>

                      {/* Gender Distribution */}
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground mb-2">Gender Distribution</p>
                        {segment.customerCount > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {segment.genderDistribution?.male > 0 && segment.customerCount > 0 && (
                              <span className="text-xs">
                                Male: {segment.genderDistribution.male} ({((segment.genderDistribution.male / segment.customerCount) * 100).toFixed(1)}%)
                              </span>
                            )}
                            {segment.genderDistribution?.female > 0 && segment.customerCount > 0 && (
                              <span className="text-xs">
                                Female: {segment.genderDistribution.female} ({((segment.genderDistribution.female / segment.customerCount) * 100).toFixed(1)}%)
                              </span>
                            )}
                            {segment.genderDistribution?.unknown > 0 && segment.customerCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                No gender data: {segment.genderDistribution.unknown} ({((segment.genderDistribution.unknown / segment.customerCount) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No customers in segment</span>
                        )}
                      </div>

                      {/* Top Cities */}
                      {segment.topCities?.length > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <MapPin className="w-3 h-3 text-orange-500" />
                            <p className="text-xs text-muted-foreground">Top Cities</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(segment.topCities) ? segment.topCities.map((city: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {city}
                              </Badge>
                            )) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </div>
                      )}

                      {/* Age Range */}
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground mb-1">Age Range</p>
                        <span className="text-xs">
                          {Number.isFinite(segment.ageRange?.min) && Number.isFinite(segment.ageRange?.max) && Number.isFinite(segment.ageRange?.avg) ? 
                            `${segment.ageRange.min}-${segment.ageRange.max} years (avg: ${segment.ageRange.avg})` : 'N/A'}
                        </span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {segment.type === 'custom' ? 'Custom segment' : 'Customer audience segment'} • {segment.recentlyActive.toLocaleString()} recently active
                          </p>
                          {segment.type === 'custom' && (
                            <div className="flex gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenEditModal(segment)}
                                    className="h-6 w-6 p-0"
                                    aria-label={`Edit ${segment.name} segment`}
                                    data-testid={`button-edit-segment-footer-${segment.id}`}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit segment</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipProvider>
              ))
            )}
          </div>
        )}
      </main>

      {/* Create Segment Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={closeCreateModal}>
        <DialogContent aria-describedby="segment-dialog-description">
          <DialogHeader>
            <DialogTitle>Create New Segment</DialogTitle>
            <p id="segment-dialog-description" className="text-sm text-muted-foreground">
              Create custom customer segments to organize your audience for targeted analysis and engagement.
            </p>
          </DialogHeader>

          <TooltipProvider>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label htmlFor="name">Segment Name</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Choose a descriptive name that clearly identifies this customer group.
                        Examples: "Premium Listeners", "Jakarta Professionals", "Young Adults"
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g., High Value Customers"
                  required
                  aria-describedby="name-help"
                  data-testid="input-segment-name"
                  autoComplete="off"
                />
                <div id="name-help" className="sr-only">
                  Enter a descriptive name for this customer segment. This field is required.
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label htmlFor="description">Description</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Explain the purpose and characteristics of this segment.
                        This helps team members understand who belongs in this group and why.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Describe this customer segment..."
                  rows={3}
                  aria-describedby="description-help"
                  data-testid="textarea-segment-description"
                  autoComplete="off"
                />
                <div id="description-help" className="sr-only">
                  Optional. Explain the purpose and characteristics of this segment to help team members understand its use.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Label>Customer Filters</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="max-w-sm space-y-2">
                          <p className="font-medium">Create filtering rules for automatic customer inclusion</p>
                          <p className="text-xs text-muted-foreground">
                            Add rules to automatically include customers based on their data. Leave empty for manual segments.
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCriteriaRule}
                    aria-describedby="filters-help"
                    data-testid="button-add-criteria-rule"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Rule
                  </Button>
                  <div id="filters-help" className="sr-only">
                    Add filtering rules to automatically include customers in this segment based on their data.
                  </div>
                </div>

                {criteriaRules.length === 0 ? (
                  <div 
                    className="text-center py-6 border-2 border-dashed border-muted rounded-lg"
                    role="status"
                    aria-live="polite"
                    data-testid="criteria-rules-empty-state"
                  >
                    <p className="text-sm text-muted-foreground mb-2">No filtering rules added</p>
                    <p className="text-xs text-muted-foreground">Add rules to automatically include customers in this segment</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {criteriaRules.map((rule, index) => (
                      <div key={rule.id} className="flex gap-2 items-end p-3 border rounded-lg">
                        <div className="flex-1 space-y-2">
                          <div className={`grid gap-2 ${rule.operator === 'exists' || rule.operator === 'not_exists' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            <div>
                              <Label className="text-xs">Field</Label>
                              <Select
                                value={rule.field}
                                onValueChange={(value) => updateCriteriaRule(rule.id, 'field', value)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select field" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                  {renderFieldOptions()}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="text-xs">Condition</Label>
                                {rule.field && isLocationField(rule.field) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs text-sm">
                                        <strong>For location fields:</strong><br/>
                                        • "Contains" finds partial matches (e.g., "Jakarta" finds "Jakarta Barat")<br/>
                                        • "Exact Match" requires complete text match
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              <Select
                                value={rule.operator}
                                onValueChange={(value) => updateCriteriaRule(rule.id, 'operator', value)}
                                disabled={!rule.field}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder={rule.field ? "Select condition" : "Select field first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {rule.field && getConditionsForField(rule.field).map((condition) => (
                                    <SelectItem key={condition.value} value={condition.value}>
                                      {condition.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Hide value input for existence-based conditions */}
                            {rule.operator !== 'exists' && rule.operator !== 'not_exists' && (
                              <div>
                                <Label className="text-xs">Value</Label>
                                {rule.field && getFieldType(rule.field) === 'category' && getCategoryOptions(rule.field)?.length > 0 ? (
                                  <Select
                                    value={rule.value}
                                    onValueChange={(value) => updateCriteriaRule(rule.id, 'value', value)}
                                    disabled={!rule.operator}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder={rule.operator ? "Select option" : "Select condition first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getCategoryOptions(rule.field)?.map((option) => (
                                        <SelectItem key={option} value={option}>
                                          {option}
                                        </SelectItem>
                                      )) || []}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={rule.value}
                                    onChange={(e) => updateCriteriaRule(rule.id, 'value', e.target.value)}
                                    placeholder={rule.field && rule.operator ? getValuePlaceholder(rule.field, rule.operator) : "Enter value"}
                                    className="h-8"
                                    disabled={!rule.operator}
                                    type={rule.field && getFieldType(rule.field) === 'numeric' ? 'number' :
                                          rule.field && getFieldType(rule.field) === 'date' ? 'date' : 'text'}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCriteriaRule(rule.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          aria-label="Remove this filtering rule"
                          data-testid={`button-remove-rule-${rule.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-start gap-2 mt-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                  <p className="text-xs text-muted-foreground">
                    Rules work together - customers must match ALL conditions to be included in this segment.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending}
                      data-testid="button-submit-create"
                      aria-describedby={createMutation.isPending ? "creating-status" : undefined}
                    >
                      {createMutation.isPending ? "Creating..." : "Create Segment"}
                      {createMutation.isPending && (
                        <span id="creating-status" className="sr-only">
                          Creating segment, please wait...
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Create this segment and add it to your customer analytics</p>
                  </TooltipContent>
                </Tooltip>
              </DialogFooter>
            </form>
          </TooltipProvider>
        </DialogContent>
      </Dialog>

      {/* Edit Segment Modal - CDP Optimized */}
      <EditSegmentModal
        segment={editingSegment}
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        onSave={handleUpdateSegment}
        isLoading={false}
      />

      {/* AI Segment Generation Modal */}
      <AiSegmentModal
        isOpen={isAiModalOpen}
        onClose={closeAiModal}
      />
    </>
  );
});

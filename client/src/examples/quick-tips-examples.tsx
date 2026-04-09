/**
 * Quick Tips v2.0.0 Implementation Examples
 *
 * Comprehensive examples demonstrating the enterprise-grade Quick Tips system.
 * Shows secure, performant implementations across various application scenarios.
 *
 * Security Features Demonstrated:
 * - Automatic XSS prevention and content sanitization
 * - Input validation for all configurations
 * - Type-safe preset usage with runtime validation
 *
 * Performance Features Demonstrated:
 * - Memoized components preventing unnecessary re-renders
 * - Stable configuration objects for optimal performance
 * - Efficient tip management with O(1) lookups
 *
 * Usage Examples:
 * - Basic tip implementation with presets
 * - Advanced custom configurations
 * - Conditional tip rendering
 * - Integration with forms and interactive elements
 *
 * @created August 12, 2025
 * @updated August 13, 2025 - Enhanced with v2.0.0 enterprise features
 * @version 2.0.0
 */

import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuickTip, QuickTipPresets } from '@/components/ui/quick-tip';
import { CustomersTips, DataImportTips } from '@/components/common/page-tips';
import { Download, RefreshCw, Search, Upload, Users, Settings } from 'lucide-react';

// Example 1: Basic Button with Tip
export function ExampleBasicButton() {
  return (
    <QuickTip
      config={{
        ...QuickTipPresets.tip("Click to save your current progress"),
        id: 'save-button-tip'
      }}
    >
      <Button>Save Changes</Button>
    </QuickTip>
  );
}

// Example 2: Form Field with Validation Tip
export function ExampleFormField() {
  return (
    <div className="space-y-2">
      <label>Email Address</label>
      <QuickTip
        config={{
          ...QuickTipPresets.info(
            "We'll send account verification and important updates to this email",
            "Email Purpose"
          ),
          id: 'email-field-tip'
        }}
      >
        <Input
          type="email"
          placeholder="your.email@company.com"
          className="w-full"
        />
      </QuickTip>
    </div>
  );
}

// Example 3: Feature with NEW Badge
export function ExampleNewFeature() {
  return (
    <QuickTip
      config={{
        ...QuickTipPresets.feature(
          "NEW: AI-powered search understands natural language. Try searching for 'customers from Jakarta who are students'",
          "Smart Search"
        ),
        id: 'ai-search-feature',
        showBadge: true
      }}
    >
      <div className="relative">
        <Button variant="outline" className="w-full">
          <Search className="h-4 w-4 mr-2" />
          AI Smart Search
        </Button>
        <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
          NEW
        </Badge>
      </div>
    </QuickTip>
  );
}

// Example 4: Warning for Destructive Action
export function ExampleWarningAction() {
  return (
    <QuickTip
      config={{
        ...QuickTipPresets.warning(
          "This will permanently delete all selected customers and cannot be undone. Make sure you have a backup.",
          "Permanent Deletion"
        ),
        id: 'delete-customers-warning'
      }}
    >
      <Button variant="destructive">
        Delete Selected Customers
      </Button>
    </QuickTip>
  );
}

// Example 5: Using Page-Specific Tips
export function ExampleCustomerManagement() {
  const tips = CustomersTips();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Management</CardTitle>
        <CardDescription>Manage your customer database</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter system with tip */}
        {tips.filterSystem(
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Advanced Filters</h3>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Age range..." />
              <Input placeholder="Location..." />
              <Input placeholder="Profession..." />
            </div>
          </div>
        )}

        {/* Bulk actions with tip */}
        {tips.bulkActions(
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Users className="h-4 w-4 mr-2" />
              Add to Segment
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Selected
            </Button>
          </div>
        )}

        {/* Vector search with tip */}
        {tips.vectorSearch(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers using natural language..."
              className="pl-10"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Example 6: Data Import Flow with Tips
export function ExampleDataImportFlow() {
  const tips = DataImportTips();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Import</CardTitle>
        <CardDescription>Import customer data from files</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File format info */}
        {tips.aiColumnMapping(
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag & drop files or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports CSV, Excel, TXT, and DOCX files
            </p>
          </div>
        )}

        {/* AI column mapping */}
        {tips.aiColumnMapping(
          <div className="p-4 bg-blue-50 rounded border">
            <h4 className="font-semibold text-blue-900 mb-2">AI Column Mapping</h4>
            <p className="text-sm text-blue-700">
              Our AI will automatically map your file columns to customer fields
            </p>
          </div>
        )}

        {/* Data validation */}
        {tips.dataValidation(
          <div className="space-y-2">
            <h4 className="font-semibold">Data Preview</h4>
            <div className="border rounded p-4 bg-gray-50">
              <p className="text-sm text-muted-foreground">
                Preview your data before importing...
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Example 7: Toolbar with Multiple Tips
export function ExampleDataTableToolbar() {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <h2 className="text-lg font-semibold">Customer Database</h2>

      <div className="flex gap-2">
        <QuickTip
          config={{
            ...QuickTipPresets.tip("Export all visible data as CSV or Excel file"),
            id: 'export-data-tip'
          }}
        >
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </QuickTip>

        <QuickTip
          config={{
            ...QuickTipPresets.info("Refresh data from server to see latest updates"),
            id: 'refresh-data-tip'
          }}
        >
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </QuickTip>

        <QuickTip
          config={{
            ...QuickTipPresets.tip("Configure table columns, filters, and display options"),
            id: 'table-settings-tip'
          }}
        >
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </QuickTip>
      </div>
    </div>
  );
}

// Example 8: Conditional Tips Based on User State
export function ExampleConditionalTips({ isNewUser }: { isNewUser: boolean }) {
  const welcomeTip = (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.feature(
          "Welcome! This dashboard shows your customer analytics. Click around to explore the features.",
          "Welcome to Dashboard"
        ),
        id: 'welcome-dashboard-tip'
      }}
    >
      {children}
    </QuickTip>
  );

  const regularTip = (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.info("Your analytics dashboard with real-time customer insights"),
        id: 'dashboard-info-tip'
      }}
    >
      {children}
    </QuickTip>
  );

  const dashboardCard = (
    <Card>
      <CardHeader>
        <CardTitle>Analytics Dashboard</CardTitle>
        <CardDescription>Customer insights and metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Your customer analytics content here...</p>
      </CardContent>
    </Card>
  );

  // Show different tips based on user state
  return isNewUser ? welcomeTip(dashboardCard) : regularTip(dashboardCard);
}

// Example 9: Success State Tip
export function ExampleSuccessState({ showSuccess }: { showSuccess: boolean }) {
  return (
    <div className="space-y-4">
      {showSuccess && (
        <QuickTip
          config={{
            ...QuickTipPresets.success("Great! Your customer data has been imported successfully."),
            id: 'import-success-tip'
          }}
        >
          <div className="p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-green-800 font-semibold">Import Completed!</p>
            <p className="text-green-700 text-sm">Your data is now available for analysis.</p>
          </div>
        </QuickTip>
      )}
    </div>
  );
}

// Example 10: Complex Configuration
export function ExampleAdvancedConfiguration() {
  return (
    <QuickTip
      config={{
        content: "This is a custom tip with advanced positioning and styling",
        title: "Advanced Configuration",
        id: 'advanced-config-tip',
        maxWidth: 'lg',
        category: 'feature' // Custom category
      }}
    >
      <Button>Advanced Feature</Button>
    </QuickTip>
  );
}

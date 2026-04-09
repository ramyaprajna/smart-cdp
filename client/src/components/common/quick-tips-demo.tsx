/**
 * Quick Tips Demo Component
 *
 * Demonstrates the Quick Tips system with various examples
 * and provides a control interface for managing tips.
 *
 * @created August 12, 2025
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickTip, QuickTipsControlPanel, QuickTipPresets } from "@/components/ui/quick-tip";
import { DashboardTips, CustomersTips, SegmentsTips, DataImportTips } from "@/components/common/page-tips";
import {
  BarChart3,
  Search,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  Zap,
  Info
} from "lucide-react";

export function QuickTipsDemo() {
  const dashboardTips = DashboardTips();
  const customersTips = CustomersTips();
  const segmentsTips = SegmentsTips();
  const importTips = DataImportTips();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quick Tips System Demo</h1>
          <p className="text-muted-foreground">
            Interactive tooltips for user guidance throughout the application
          </p>
        </div>
        <QuickTipsControlPanel />
      </div>

      {/* Category Examples */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              Help Tips
            </CardTitle>
            <CardDescription>General help and information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.info("Click here to learn about this feature's functionality and how to use it effectively."),
                id: 'demo-help-button'
              }}
            >
              <Button variant="outline" className="w-full">
                <HelpCircle className="h-4 w-4 mr-2" />
                Help Button Example
              </Button>
            </QuickTip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-600" />
              Tips & Tricks
            </CardTitle>
            <CardDescription>Helpful suggestions and best practices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.tip(
                  "Pro tip: Use keyboard shortcuts Ctrl+K to quickly access search functionality and speed up your workflow.",
                  "Keyboard Shortcuts"
                ),
                id: 'demo-tip-search'
              }}
            >
              <Button variant="outline" className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Search Feature
              </Button>
            </QuickTip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" />
              Feature Highlights
            </CardTitle>
            <CardDescription>New features and capabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.feature(
                  "NEW: AI-powered vector search allows you to find similar customers using natural language queries. Try searching for 'young professionals in Jakarta'.",
                  "AI Vector Search"
                ),
                id: 'demo-feature-vector-search',
                showBadge: true
              }}
            >
              <Button variant="outline" className="w-full relative">
                <Zap className="h-4 w-4 mr-2" />
                New AI Feature
                <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-xs">
                  !
                </Badge>
              </Button>
            </QuickTip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Warnings
            </CardTitle>
            <CardDescription>Important cautions and alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.warning(
                  "Warning: This action cannot be undone. Make sure you have backed up your data before proceeding with the deletion.",
                  "Destructive Action"
                ),
                id: 'demo-warning-delete'
              }}
            >
              <Button variant="destructive" className="w-full">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Delete Data
              </Button>
            </QuickTip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Success States
            </CardTitle>
            <CardDescription>Confirmation and success messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.success("Great! Your data has been successfully imported and is now available for analysis."),
                id: 'demo-success-import'
              }}
            >
              <Button variant="default" className="w-full bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Import Complete
              </Button>
            </QuickTip>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-slate-600" />
              Information
            </CardTitle>
            <CardDescription>General information and context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickTip
              config={{
                ...QuickTipPresets.info(
                  "This dashboard shows real-time analytics from your customer data. Charts update automatically as new data is imported.",
                  "Dashboard Information"
                ),
                id: 'demo-info-dashboard'
              }}
            >
              <Button variant="outline" className="w-full">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics Dashboard
              </Button>
            </QuickTip>
          </CardContent>
        </Card>
      </div>

      {/* Page-Specific Tips Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Page-Specific Quick Tips</CardTitle>
          <CardDescription>
            Context-aware tips that appear on specific pages to guide users through features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dashboard Tips</h3>
              <div className="space-y-2">
                {dashboardTips.analyticsOverview(
                  <Button variant="outline" size="sm" className="w-full">
                    Analytics Overview
                  </Button>
                )}
                {dashboardTips.embeddingStatus(
                  <Button variant="outline" size="sm" className="w-full">
                    Embedding Status
                  </Button>
                )}
                {dashboardTips.quickActions(
                  <Button variant="outline" size="sm" className="w-full">
                    Quick Actions
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Customer Management Tips</h3>
              <div className="space-y-2">
                {customersTips.filterSystem(
                  <Button variant="outline" size="sm" className="w-full">
                    Smart Filtering
                  </Button>
                )}
                {customersTips.bulkActions(
                  <Button variant="outline" size="sm" className="w-full">
                    Bulk Operations
                  </Button>
                )}
                {customersTips.vectorSearch(
                  <Button variant="outline" size="sm" className="w-full">
                    AI Search
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Segmentation Tips</h3>
              <div className="space-y-2">
                {segmentsTips.aiGeneration(
                  <Button variant="outline" size="sm" className="w-full">
                    AI Segments
                  </Button>
                )}
                {segmentsTips.criteriaBuilder(
                  <Button variant="outline" size="sm" className="w-full">
                    Criteria Builder
                  </Button>
                )}
                {segmentsTips.performanceTracking(
                  <Button variant="outline" size="sm" className="w-full">
                    Performance Tracking
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Data Import Tips</h3>
              <div className="space-y-2">
                {importTips.aiColumnMapping(
                  <Button variant="outline" size="sm" className="w-full">
                    AI Column Mapping
                  </Button>
                )}
                {importTips.dataValidation(
                  <Button variant="outline" size="sm" className="w-full">
                    Data Validation
                  </Button>
                )}
                {importTips.errorHandling(
                  <Button variant="outline" size="sm" className="w-full">
                    Error Handling
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Implementation Guide</CardTitle>
          <CardDescription>
            How to use Quick Tips in your components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Basic Usage:</h4>
            <pre className="text-sm overflow-x-auto">
{`import { QuickTip, QuickTipPresets } from '@/components/ui/quick-tip';

<QuickTip
  config={{
    ...QuickTipPresets.tip("Your helpful tip content here"),
    id: 'unique-tip-id'
  }}
>
  <Button>Your UI Element</Button>
</QuickTip>`}
            </pre>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Page-Specific Tips:</h4>
            <pre className="text-sm overflow-x-auto">
{`import { DashboardTips } from '@/components/common/page-tips';

const tips = DashboardTips();

// Use in your component
{tips.analyticsOverview(
  <YourComponent />
)}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

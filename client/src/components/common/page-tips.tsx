/**
 * Page-Specific Quick Tips
 *
 * Predefined quick tips for different pages in the application.
 * Provides contextual guidance based on the current page/feature.
 *
 * Features (v2.0.0):
 * - Secure preset configurations with automatic sanitization
 * - Performance-optimized with stable object references
 * - Type-safe configurations preventing runtime errors
 * - Contextual help for all major application features
 *
 * Usage:
 * import { DashboardTips } from '@/components/common/page-tips';
 * const tips = DashboardTips();
 * return tips.analyticsOverview(<YourComponent />);
 *
 * @created August 12, 2025
 * @updated August 13, 2025 - Enhanced with v2.0.0 security and performance features
 * @version 2.0.0
 */

import React from 'react';
import { QuickTip, QuickTipPresets } from '@/components/ui/quick-tip';

// Dashboard Page Tips
export function DashboardTips() {
  return {

    embeddingStatus: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.info(
            "The embedding status shows how many customers have AI-powered vector embeddings. These enable semantic search and advanced analytics.",
            "Vector Embeddings"
          ),
          id: 'dashboard-embedding-status'
        }}
      >
        {children}
      </QuickTip>
    ),

    quickActions: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Use the quick action buttons to rapidly access common tasks like importing data or creating customer segments.",
            "Quick Actions"
          ),
          id: 'dashboard-quick-actions'
        }}
      >
        {children}
      </QuickTip>
    ),

    analyticsOverview: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.info(
            "This analytics overview provides real-time insights into your customer data with interactive charts and key metrics.",
            "Analytics Overview"
          ),
          id: 'dashboard-analytics-overview'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Customers Page Tips
export function CustomersTips() {
  return {

    bulkActions: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Select multiple customers to perform bulk actions like adding to segments or exporting data.",
            "Bulk Operations"
          ),
          id: 'customers-bulk-actions'
        }}
      >
        {children}
      </QuickTip>
    ),

    vectorSearch: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.feature(
            "Try the vector search to find customers with similar characteristics using natural language queries like 'young professionals in Jakarta'.",
            "AI-Powered Search"
          ),
          id: 'customers-vector-search',
          maxWidth: 'lg'
        }}
      >
        {children}
      </QuickTip>
    ),

    filterSystem: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Use the smart filtering system to quickly find customers by demographics, behavior, or custom attributes.",
            "Smart Filtering"
          ),
          id: 'customers-filter-system'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Segments Page Tips
export function SegmentsTips() {
  return {

    criteriaBuilder: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Build precise segment criteria using multiple conditions. You can combine demographic, behavioral, and custom field filters.",
            "Segment Criteria"
          ),
          id: 'segments-criteria-builder'
        }}
      >
        {children}
      </QuickTip>
    ),

    performanceTracking: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.info(
            "Monitor segment performance metrics to understand customer engagement and conversion rates for each segment.",
            "Performance Insights"
          ),
          id: 'segments-performance-tracking'
        }}
      >
        {children}
      </QuickTip>
    ),

    aiGeneration: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.feature(
            "Use AI to automatically generate customer segments based on behavioral patterns and characteristics.",
            "AI Segment Generation"
          ),
          id: 'segments-ai-generation',
          showBadge: true
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Data Import Page Tips
export function DataImportTips() {
  return {

    aiColumnMapping: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.feature(
            "Our AI automatically maps your file columns to the correct customer fields, even with international headers and different languages.",
            "Smart Column Mapping"
          ),
          id: 'import-ai-column-mapping',
          maxWidth: 'lg'
        }}
      >
        {children}
      </QuickTip>
    ),

    dataValidation: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Review the data preview carefully. Invalid records are highlighted and can be fixed before importing.",
            "Data Validation"
          ),
          id: 'import-data-validation'
        }}
      >
        {children}
      </QuickTip>
    ),

    errorHandling: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.warning(
            "If errors occur during import, you'll receive detailed reports with specific row-level issues and suggested fixes.",
            "Error Handling"
          ),
          id: 'import-error-handling'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Vector Search Page Tips
export function VectorSearchTips() {
  return {

    similarityScores: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.info(
            "Similarity scores range from 0-1, where 1.0 is a perfect match. Scores above 0.8 indicate very similar customers.",
            "Similarity Scoring"
          ),
          id: 'vector-similarity-scores'
        }}
      >
        {children}
      </QuickTip>
    ),

    advancedFilters: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Combine vector search with traditional filters to refine results by age, location, or other specific criteria.",
            "Advanced Filtering"
          ),
          id: 'vector-advanced-filters'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Admin User Management Tips
export function AdminUsersTips() {
  return {

    userInvitation: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "New users receive email invitations with activation links. They can set their own passwords upon first login.",
            "User Invitations"
          ),
          id: 'admin-user-invitation'
        }}
      >
        {children}
      </QuickTip>
    ),

    securitySettings: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.warning(
            "Admin accounts have full system access. Use caution when assigning admin roles and regularly review user permissions.",
            "Security Considerations"
          ),
          id: 'admin-security-settings'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Archive Management Tips
export function ArchiveManagementTips() {
  return {

    performanceOptimization: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.tip(
            "Regular archiving improves database performance by reducing the size of active customer tables.",
            "Performance Benefits"
          ),
          id: 'archive-performance'
        }}
      >
        {children}
      </QuickTip>
    ),

    dataRetrieval: (children: React.ReactNode) => (
      <QuickTip
        config={{
          ...QuickTipPresets.feature(
            "Archived data remains searchable and can be restored to active status when needed for analysis.",
            "Data Retrieval"
          ),
          id: 'archive-data-retrieval'
        }}
      >
        {children}
      </QuickTip>
    )
  };
}

// Common UI Element Tips
export const CommonTips = {
  saveButton: (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.tip("Remember to save your changes before navigating away from this page."),
        id: 'common-save-reminder'
      }}
    >
      {children}
    </QuickTip>
  ),

  refreshButton: (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.info("Click to refresh data and see the latest updates."),
        id: 'common-refresh-button'
      }}
    >
      {children}
    </QuickTip>
  ),

  exportButton: (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.tip("Export data in CSV or Excel format for external analysis."),
        id: 'common-export-button'
      }}
    >
      {children}
    </QuickTip>
  ),

  searchField: (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.tip("Use keywords to quickly find specific records. Search works across all visible columns."),
        id: 'common-search-field'
      }}
    >
      {children}
    </QuickTip>
  ),

  paginationControls: (children: React.ReactNode) => (
    <QuickTip
      config={{
        ...QuickTipPresets.info("Navigate through large datasets using the pagination controls below."),
        id: 'common-pagination'
      }}
    >
      {children}
    </QuickTip>
  )
};

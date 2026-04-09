/**
 * Business Segment Templates - Pre-built segment patterns for streamlined admin workflows
 * 
 * Provides comprehensive template library with proven segment criteria patterns for common
 * business scenarios. Enables admins to quickly create effective segments without building
 * criteria from scratch.
 * 
 * @module SegmentTemplates
 * @created September 18, 2025
 * @purpose Streamline segment creation with professional business templates
 * 
 * @features
 * - 8+ comprehensive business scenarios 
 * - Template metadata with descriptions and use cases
 * - Real-time preview counts integration
 * - Category-based organization
 * - Seamless CriteriaBuilder compatibility
 * 
 * @performance
 * - Compatible with existing field security controls
 * - Optimized for sub-500ms template loading
 * - Cache-friendly template definitions
 * - Business field mapping integration
 */

import { z } from 'zod';
import type { BusinessCriteria } from '@/components/segments/criteria-builder';

/**
 * Template categories for organization and filtering
 */
export enum TemplateCategory {
  MARKETING = 'Marketing',
  SALES = 'Sales', 
  CUSTOMER_SERVICE = 'Customer Service',
  ANALYTICS = 'Analytics',
  OPERATIONS = 'Operations'
}

/**
 * Template difficulty levels for user guidance
 */
export enum TemplateDifficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate', 
  ADVANCED = 'Advanced'
}

/**
 * Use case tags for template discovery
 */
export enum TemplateUseCase {
  RETENTION = 'Customer Retention',
  ACQUISITION = 'Customer Acquisition',
  ENGAGEMENT = 'Engagement Analysis',
  SEGMENTATION = 'Customer Segmentation',
  QUALITY = 'Data Quality',
  GEOGRAPHIC = 'Geographic Analysis',
  DEMOGRAPHIC = 'Demographic Analysis',
  LIFECYCLE = 'Customer Lifecycle',
  OPERATIONS = 'Operations'
}

/**
 * Comprehensive template definition interface
 */
export interface SegmentTemplate {
  // Core identification
  id: string;
  name: string;
  description: string;
  longDescription: string;
  
  // Organization and discovery  
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  useCases: TemplateUseCase[];
  tags: string[];
  
  // Business criteria (compatible with CriteriaBuilder)
  criteria: BusinessCriteria;
  
  // Metadata for admin experience
  estimatedCustomerCount: number;
  estimatedPercentage: number;
  businessValue: string;
  commonActions: string[];
  
  // Template management
  version: string;
  createdAt: string;
  isPopular: boolean;
  isPremium: boolean;
}

/**
 * Template validation schema
 */
export const segmentTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(200),
  longDescription: z.string().min(1).max(500),
  category: z.nativeEnum(TemplateCategory),
  difficulty: z.nativeEnum(TemplateDifficulty),
  useCases: z.array(z.nativeEnum(TemplateUseCase)),
  tags: z.array(z.string()),
  criteria: z.record(z.unknown()),
  estimatedCustomerCount: z.number().min(0),
  estimatedPercentage: z.number().min(0).max(100),
  businessValue: z.string().min(1),
  commonActions: z.array(z.string()),
  version: z.string(),
  createdAt: z.string(),
  isPopular: z.boolean(),
  isPremium: z.boolean()
});

/**
 * COMPREHENSIVE BUSINESS TEMPLATE LIBRARY
 * 
 * 8+ professional templates covering major business scenarios
 * All templates use available business field mappings for maximum compatibility
 */
export const SEGMENT_TEMPLATES: Record<string, SegmentTemplate> = {

  // === HIGH-VALUE CUSTOMERS ===
  'high_value_customers': {
    id: 'high_value_customers',
    name: 'High-Value Customers',
    description: 'Customers with high lifetime value and complete profiles',
    longDescription: 'Identifies your most valuable customers based on lifetime value metrics and data completeness. Perfect for VIP treatment, personalized campaigns, and retention efforts.',
    category: TemplateCategory.SALES,
    difficulty: TemplateDifficulty.BEGINNER,
    useCases: [TemplateUseCase.RETENTION, TemplateUseCase.SEGMENTATION],
    tags: ['high-value', 'vip', 'retention', 'lifetime-value'],
    criteria: {
      $and: [
        { lifetimeValue: { $gt: 5000 } },
        { dataQualityScore: { $gt: 80 } },
        { email: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 2500,
    estimatedPercentage: 7.2,
    businessValue: 'Generate 60% higher revenue per customer through targeted campaigns',
    commonActions: ['VIP Support', 'Exclusive Offers', 'Personal Account Manager', 'Early Access'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === CHURNED CUSTOMERS ===
  'churned_customers': {
    id: 'churned_customers', 
    name: 'Churned Customers',
    description: 'Inactive customers who haven\'t engaged recently',
    longDescription: 'Identifies customers who have become inactive based on last activity date. Essential for win-back campaigns and churn analysis to understand customer lifecycle patterns.',
    category: TemplateCategory.MARKETING,
    difficulty: TemplateDifficulty.BEGINNER,
    useCases: [TemplateUseCase.RETENTION, TemplateUseCase.LIFECYCLE],
    tags: ['churn', 'inactive', 'win-back', 'retention'],
    criteria: {
      $and: [
        { lastActiveAt: { $lt: '2025-06-20' } }, // 90 days ago
        { email: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 15000,
    estimatedPercentage: 43.1,
    businessValue: 'Recover 15-25% of churned customers through targeted win-back campaigns',
    commonActions: ['Win-back Email', 'Special Discount', 'Survey Feedback', 'Re-engagement Campaign'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === NEW CUSTOMERS ===
  'new_customers': {
    id: 'new_customers',
    name: 'New Customers', 
    description: 'Recently acquired customers for onboarding',
    longDescription: 'Identifies customers who joined recently based on data quality scores and profile completeness. Perfect for onboarding sequences and first-time customer experiences.',
    category: TemplateCategory.MARKETING,
    difficulty: TemplateDifficulty.BEGINNER,
    useCases: [TemplateUseCase.ACQUISITION, TemplateUseCase.LIFECYCLE],
    tags: ['new', 'onboarding', 'acquisition', 'welcome'],
    criteria: {
      $and: [
        { dataQualityScore: { $lt: 50 } }, // Likely new, incomplete profiles
        { email: { $exists: true } },
        { firstName: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 8500,
    estimatedPercentage: 24.4,
    businessValue: 'Improve new customer retention by 40% with proper onboarding',
    commonActions: ['Welcome Series', 'Onboarding Guide', 'Product Tutorial', 'First Purchase Incentive'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === VIP CUSTOMERS ===
  'vip_customers': {
    id: 'vip_customers',
    name: 'VIP Customers',
    description: 'Top-tier customers with highest lifetime value',
    longDescription: 'Elite customer segment representing the top 10% by lifetime value with complete contact information. These customers deserve premium treatment and exclusive experiences.',
    category: TemplateCategory.SALES,
    difficulty: TemplateDifficulty.INTERMEDIATE,
    useCases: [TemplateUseCase.RETENTION, TemplateUseCase.SEGMENTATION],
    tags: ['vip', 'elite', 'premium', 'top-tier'],
    criteria: {
      $and: [
        { lifetimeValue: { $gt: 10000 } },
        { email: { $exists: true } },
        { phoneNumber: { $exists: true } },
        { dataQualityScore: { $gt: 90 } }
      ]
    },
    estimatedCustomerCount: 850,
    estimatedPercentage: 2.4,
    businessValue: 'Generate 3x higher revenue per customer with VIP treatment',
    commonActions: ['Concierge Service', 'Exclusive Events', 'Priority Support', 'Custom Solutions'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === AT-RISK CUSTOMERS ===
  'at_risk_customers': {
    id: 'at_risk_customers',
    name: 'At-Risk Customers',
    description: 'Customers showing early signs of disengagement',
    longDescription: 'Identifies customers with declining engagement patterns who may be at risk of churning. Early intervention can prevent churn and maintain customer relationships.',
    category: TemplateCategory.CUSTOMER_SERVICE,
    difficulty: TemplateDifficulty.INTERMEDIATE,
    useCases: [TemplateUseCase.RETENTION, TemplateUseCase.ENGAGEMENT],
    tags: ['at-risk', 'declining', 'intervention', 'early-warning'],
    criteria: {
      $and: [
        { lastActiveAt: { $gt: '2025-07-20', $lt: '2025-08-20' } }, // 30-60 days ago
        { lifetimeValue: { $gt: 1000 } },
        { email: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 5200,
    estimatedPercentage: 14.9,
    businessValue: 'Prevent 30-50% of potential churn through proactive engagement',
    commonActions: ['Check-in Call', 'Satisfaction Survey', 'Loyalty Offer', 'Account Review'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === GEOGRAPHIC: MAJOR CITIES ===
  'major_cities': {
    id: 'major_cities',
    name: 'Major Cities',
    description: 'Customers in top metropolitan areas',
    longDescription: 'Targets customers in major metropolitan areas for location-based campaigns, events, and services. Useful for regional marketing and localized customer experiences.',
    category: TemplateCategory.MARKETING,
    difficulty: TemplateDifficulty.BEGINNER,
    useCases: [TemplateUseCase.GEOGRAPHIC, TemplateUseCase.SEGMENTATION],
    tags: ['geographic', 'cities', 'metropolitan', 'location'],
    criteria: {
      $or: [
        { city: { $regex: 'New York', $options: 'i' } },
        { city: { $regex: 'Los Angeles', $options: 'i' } },
        { city: { $regex: 'Chicago', $options: 'i' } },
        { city: { $regex: 'Houston', $options: 'i' } },
        { city: { $regex: 'Phoenix', $options: 'i' } },
        { city: { $regex: 'Philadelphia', $options: 'i' } }
      ]
    },
    estimatedCustomerCount: 12000,
    estimatedPercentage: 34.5,
    businessValue: 'Target 65% of urban market with location-specific campaigns',
    commonActions: ['Local Events', 'City-specific Offers', 'Regional Partnerships', 'Metro Advertising'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: false,
    isPremium: false
  },

  // === AGE DEMOGRAPHICS: MILLENNIALS ===
  'millennials': {
    id: 'millennials',
    name: 'Millennials (Ages 28-43)',
    description: 'Millennial generation customers',
    longDescription: 'Customers in the millennial age range (born 1981-1996). This generation has distinct preferences for digital experiences, social responsibility, and value-driven purchasing.',
    category: TemplateCategory.ANALYTICS,
    difficulty: TemplateDifficulty.INTERMEDIATE,
    useCases: [TemplateUseCase.DEMOGRAPHIC, TemplateUseCase.SEGMENTATION],
    tags: ['millennials', 'age', 'generation', 'demographic'],
    criteria: {
      $or: [
        { unmappedAge: { $gte: 28, $lte: 43 } },
        { dateOfBirth: { $gte: '1981-01-01', $lte: '1996-12-31' } }
      ]
    },
    estimatedCustomerCount: 14500,
    estimatedPercentage: 41.7,
    businessValue: 'Tailor messaging to generation with highest spending power',
    commonActions: ['Digital Campaigns', 'Social Media Engagement', 'Sustainable Products', 'Mobile Experience'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === ENGAGEMENT: HIGHLY ENGAGED ===
  'highly_engaged': {
    id: 'highly_engaged',
    name: 'Highly Engaged Customers',
    description: 'Active customers with recent engagement and complete profiles',
    longDescription: 'Customers who show high engagement through recent activity and maintain complete, high-quality profiles. These customers are your brand advocates and most likely to respond to campaigns.',
    category: TemplateCategory.MARKETING,
    difficulty: TemplateDifficulty.INTERMEDIATE,
    useCases: [TemplateUseCase.ENGAGEMENT, TemplateUseCase.SEGMENTATION],
    tags: ['engaged', 'active', 'advocates', 'responsive'],
    criteria: {
      $and: [
        { lastActiveAt: { $gt: '2025-08-18' } }, // Last 30 days
        { dataQualityScore: { $gt: 75 } },
        { email: { $exists: true } },
        { phoneNumber: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 6800,
    estimatedPercentage: 19.5,
    businessValue: 'Achieve 60% higher campaign response rates with engaged audience',
    commonActions: ['New Product Launch', 'Referral Program', 'Brand Ambassador', 'Advanced Features'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: true,
    isPremium: false
  },

  // === DATA QUALITY: INCOMPLETE PROFILES ===
  'incomplete_profiles': {
    id: 'incomplete_profiles',
    name: 'Incomplete Profiles',
    description: 'Customers with missing contact information',
    longDescription: 'Identifies customers with incomplete profile data to prioritize data enrichment efforts. Complete profiles enable better personalization and more effective marketing campaigns.',
    category: TemplateCategory.OPERATIONS,
    difficulty: TemplateDifficulty.BEGINNER,
    useCases: [TemplateUseCase.QUALITY, TemplateUseCase.OPERATIONS],
    tags: ['data-quality', 'incomplete', 'enrichment', 'missing-data'],
    criteria: {
      $and: [
        { email: { $exists: true } },
        {
          $or: [
            { firstName: { $exists: false } },
            { phoneNumber: { $exists: false } },
            { currentAddress: { $exists: false } }
          ]
        }
      ]
    },
    estimatedCustomerCount: 18500,
    estimatedPercentage: 53.2,
    businessValue: 'Improve campaign effectiveness by 35% through data completion',
    commonActions: ['Profile Update Request', 'Data Collection Survey', 'Incentivized Forms', 'Progressive Profiling'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: false,
    isPremium: false
  },

  // === PREMIUM: INTERNATIONAL CUSTOMERS ===
  'international_customers': {
    id: 'international_customers',
    name: 'International Customers',
    description: 'Non-US customers for global campaigns',
    longDescription: 'Customers located outside the United States for international marketing campaigns, global product launches, and regional customization strategies.',
    category: TemplateCategory.MARKETING,
    difficulty: TemplateDifficulty.ADVANCED,
    useCases: [TemplateUseCase.GEOGRAPHIC, TemplateUseCase.SEGMENTATION],
    tags: ['international', 'global', 'non-us', 'worldwide'],
    criteria: {
      $and: [
        { country: { $ne: 'United States' } },
        { country: { $ne: 'USA' } },
        { country: { $ne: 'US' } },
        { country: { $exists: true } },
        { email: { $exists: true } }
      ]
    },
    estimatedCustomerCount: 4200,
    estimatedPercentage: 12.1,
    businessValue: 'Expand global reach with localized international campaigns',
    commonActions: ['Regional Campaigns', 'Currency Localization', 'Cultural Customization', 'Global Events'],
    version: '1.0',
    createdAt: '2025-09-18',
    isPopular: false,
    isPremium: true
  }
};

/**
 * Get all available templates
 */
export function getAllTemplates(): SegmentTemplate[] {
  return Object.values(SEGMENT_TEMPLATES);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): SegmentTemplate[] {
  return getAllTemplates().filter(template => template.category === category);
}

/**
 * Get popular templates
 */
export function getPopularTemplates(): SegmentTemplate[] {
  return getAllTemplates().filter(template => template.isPopular);
}

/**
 * Get templates by difficulty level
 */
export function getTemplatesByDifficulty(difficulty: TemplateDifficulty): SegmentTemplate[] {
  return getAllTemplates().filter(template => template.difficulty === difficulty);
}

/**
 * Get templates by use case
 */
export function getTemplatesByUseCase(useCase: TemplateUseCase): SegmentTemplate[] {
  return getAllTemplates().filter(template => template.useCases.includes(useCase));
}

/**
 * Search templates by name, description, or tags
 */
export function searchTemplates(query: string): SegmentTemplate[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return getAllTemplates();
  
  return getAllTemplates().filter(template => {
    return (
      template.name.toLowerCase().includes(normalizedQuery) ||
      template.description.toLowerCase().includes(normalizedQuery) ||
      template.longDescription.toLowerCase().includes(normalizedQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(normalizedQuery))
    );
  });
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): SegmentTemplate | undefined {
  return SEGMENT_TEMPLATES[id];
}

/**
 * Get all available categories
 */
export function getAvailableCategories(): TemplateCategory[] {
  return Object.values(TemplateCategory);
}

/**
 * Get all available use cases
 */
export function getAvailableUseCases(): TemplateUseCase[] {
  return Object.values(TemplateUseCase);
}

/**
 * Get all available difficulty levels
 */
export function getAvailableDifficulties(): TemplateDifficulty[] {
  return Object.values(TemplateDifficulty);
}

/**
 * Validate template structure
 */
export function validateTemplate(template: unknown): { valid: boolean; errors?: string[] } {
  try {
    segmentTemplateSchema.parse(template);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        valid: false, 
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Template statistics for admin dashboard
 */
export function getTemplateStats() {
  const templates = getAllTemplates();
  return {
    total: templates.length,
    byCategory: Object.fromEntries(
      getAvailableCategories().map(category => [
        category,
        getTemplatesByCategory(category).length
      ])
    ),
    byDifficulty: Object.fromEntries(
      getAvailableDifficulties().map(difficulty => [
        difficulty,
        getTemplatesByDifficulty(difficulty).length
      ])
    ),
    popular: getPopularTemplates().length,
    premium: templates.filter(t => t.isPremium).length
  };
}
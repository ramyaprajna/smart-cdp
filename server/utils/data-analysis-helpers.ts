/**
 * Data Analysis Helper Functions
 *
 * Extracted reusable functions for data analysis operations.
 * Reduces complexity in main service files by breaking down large functions.
 *
 * Created: August 11, 2025 - Refactoring consolidation
 */

import { Customer } from '@shared/schema';

export interface DemographicAnalysis {
  ageDistribution: Record<string, number>;
  genderDistribution: Record<string, number>;
  locationDistribution: Record<string, number>;
  professionDistribution: Record<string, number>;
}

export interface EngagementAnalysis {
  lastActiveDistribution: Record<string, number>;
  segmentDistribution: Record<string, number>;
  averageEngagementScore: number;
}

export interface BusinessMetrics {
  lifetimeValueDistribution: Record<string, number>;
  totalLifetimeValue: number;
  averageLifetimeValue: number;
  dataQualityDistribution: Record<string, number>;
}

export interface DataPatterns {
  isNumeric: boolean;
  isDate: boolean;
  isEmail: boolean;
  isPhone: boolean;
  hasSpecialChars: boolean;
  avgLength: number;
  uniqueValues: number;
  nullCount: number;
  patterns: string[];
}

export class DataAnalysisHelpers {
  /**
   * Analyze demographic patterns in customer data
   */
  static analyzeDemographics(customers: Customer[]): DemographicAnalysis {
    const ageDistribution: Record<string, number> = {};
    const genderDistribution: Record<string, number> = {};
    const locationDistribution: Record<string, number> = {};
    const professionDistribution: Record<string, number> = {};

    customers.forEach(customer => {
      // Age distribution
      if (customer.dateOfBirth) {
        const age = new Date().getFullYear() - new Date(customer.dateOfBirth).getFullYear();
        const ageRange = this.categorizeAge(age);
        ageDistribution[ageRange] = (ageDistribution[ageRange] || 0) + 1;
      }

      // Gender distribution
      if (customer.gender) {
        const normalizedGender = this.normalizeGender(customer.gender);
        genderDistribution[normalizedGender] = (genderDistribution[normalizedGender] || 0) + 1;
      }

      // Location distribution
      if (customer.currentAddress) {
        const location = this.extractLocation(customer.currentAddress);
        if (location) {
          locationDistribution[location] = (locationDistribution[location] || 0) + 1;
        }
      }

      // Profession distribution (from customer segment or unmapped fields)
      const profession = this.extractProfession(customer);
      if (profession) {
        professionDistribution[profession] = (professionDistribution[profession] || 0) + 1;
      }
    });

    return {
      ageDistribution,
      genderDistribution,
      locationDistribution,
      professionDistribution
    };
  }

  /**
   * Analyze engagement patterns
   */
  static analyzeEngagement(customers: Customer[]): EngagementAnalysis {
    const lastActiveDistribution: Record<string, number> = {};
    const segmentDistribution: Record<string, number> = {};
    let totalEngagementScore = 0;

    customers.forEach(customer => {
      // Last active distribution
      if (customer.lastActiveAt) {
        const daysSinceActive = this.calculateDaysSince(customer.lastActiveAt);
        const activeCategory = this.categorizeActivity(daysSinceActive);
        lastActiveDistribution[activeCategory] = (lastActiveDistribution[activeCategory] || 0) + 1;
      }

      // Segment distribution
      if (customer.customerSegment) {
        segmentDistribution[customer.customerSegment] = (segmentDistribution[customer.customerSegment] || 0) + 1;
      }

      // Calculate engagement score based on available data
      const engagementScore = this.calculateEngagementScore(customer);
      totalEngagementScore += engagementScore;
    });

    return {
      lastActiveDistribution,
      segmentDistribution,
      averageEngagementScore: customers.length > 0 ? totalEngagementScore / customers.length : 0
    };
  }

  /**
   * Analyze business metrics
   */
  static analyzeBusinessMetrics(customers: Customer[]): BusinessMetrics {
    const lifetimeValueDistribution: Record<string, number> = {};
    const dataQualityDistribution: Record<string, number> = {};
    let totalLifetimeValue = 0;

    customers.forEach(customer => {
      // Lifetime value distribution
      if (customer.lifetimeValue) {
        const valueCategory = this.categorizeLifetimeValue(customer.lifetimeValue);
        lifetimeValueDistribution[valueCategory] = (lifetimeValueDistribution[valueCategory] || 0) + 1;
        totalLifetimeValue += customer.lifetimeValue;
      }

      // Data quality distribution
      const qualityScore = this.calculateDataQualityScore(customer);
      const qualityCategory = this.categorizeDataQuality(qualityScore);
      dataQualityDistribution[qualityCategory] = (dataQualityDistribution[qualityCategory] || 0) + 1;
    });

    return {
      lifetimeValueDistribution,
      totalLifetimeValue,
      averageLifetimeValue: customers.length > 0 ? totalLifetimeValue / customers.length : 0,
      dataQualityDistribution
    };
  }

  /**
   * Calculate data patterns for column analysis
   */
  static calculateDataPatterns(samples: any[]): DataPatterns {
    if (!samples || samples.length === 0) {
      return this.getEmptyPatterns();
    }

    const stringValues = samples.map(s => String(s)).filter(s => s && s.trim() !== '');

    return {
      isNumeric: this.isNumericData(stringValues),
      isDate: this.isDateData(stringValues),
      isEmail: this.isEmailData(stringValues),
      isPhone: this.isPhoneData(stringValues),
      hasSpecialChars: this.hasSpecialCharacters(stringValues),
      avgLength: this.calculateAverageLength(stringValues),
      uniqueValues: new Set(stringValues).size,
      nullCount: samples.length - stringValues.length,
      patterns: this.extractPatterns(stringValues)
    };
  }

  /**
   * Helper methods for categorization
   */
  private static categorizeAge(age: number): string {
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    return '55+';
  }

  private static normalizeGender(gender: string): string {
    const normalized = gender.toLowerCase().trim();
    if (['male', 'm', 'laki-laki', 'pria'].includes(normalized)) return 'Male';
    if (['female', 'f', 'perempuan', 'wanita'].includes(normalized)) return 'Female';
    return 'Other';
  }

  private static extractLocation(address: any): string | null {
    if (typeof address === 'string') {
      // Extract city from address string
      const parts = address.split(',').map(p => p.trim());
      return parts[parts.length - 1] || parts[0];
    }
    if (typeof address === 'object' && address.city) {
      return address.city;
    }
    return null;
  }

  private static extractProfession(customer: Customer): string | null {
    // Try to extract from unmapped fields or customer segment
    if (customer.unmappedFields && typeof customer.unmappedFields === 'object') {
      const unmapped = customer.unmappedFields as Record<string, any>;
      const professionFields = ['profession', 'job', 'occupation', 'title', 'work'];

      for (const field of professionFields) {
        if (unmapped[field]) {
          return String(unmapped[field]);
        }
      }
    }

    return customer.customerSegment || null;
  }

  private static calculateDaysSince(date: Date): number {
    return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  }

  private static categorizeActivity(daysSinceActive: number): string {
    if (daysSinceActive <= 7) return 'Very Active (Last 7 days)';
    if (daysSinceActive <= 30) return 'Active (Last 30 days)';
    if (daysSinceActive <= 90) return 'Moderately Active (Last 90 days)';
    return 'Inactive (90+ days)';
  }

  private static calculateEngagementScore(customer: Customer): number {
    let score = 0;

    // Points for recent activity
    if (customer.lastActiveAt) {
      const daysSince = this.calculateDaysSince(customer.lastActiveAt);
      if (daysSince <= 7) score += 30;
      else if (daysSince <= 30) score += 20;
      else if (daysSince <= 90) score += 10;
    }

    // Points for lifetime value
    if (customer.lifetimeValue && customer.lifetimeValue > 0) {
      score += Math.min(30, customer.lifetimeValue / 100);
    }

    // Points for data completeness
    const completeness = this.calculateDataQualityScore(customer);
    score += completeness * 40;

    return Math.min(100, score);
  }

  private static categorizeLifetimeValue(value: number): string {
    if (value < 100) return 'Low ($0-$99)';
    if (value < 500) return 'Medium ($100-$499)';
    if (value < 1000) return 'High ($500-$999)';
    return 'Premium ($1000+)';
  }

  private static calculateDataQualityScore(customer: Customer): number {
    const fields = ['firstName', 'lastName', 'email', 'phoneNumber', 'dateOfBirth'];
    const completed = fields.filter(field => customer[field as keyof Customer]).length;
    return completed / fields.length;
  }

  private static categorizeDataQuality(score: number): string {
    if (score >= 0.8) return 'High Quality (80%+)';
    if (score >= 0.6) return 'Good Quality (60-79%)';
    if (score >= 0.4) return 'Fair Quality (40-59%)';
    return 'Poor Quality (<40%)';
  }

  /**
   * Data pattern detection methods
   */
  private static isNumericData(values: string[]): boolean {
    return values.length > 0 && values.every(v => !isNaN(Number(v.replace(/[,\s$]/g, ''))));
  }

  private static isDateData(values: string[]): boolean {
    return values.length > 0 && values.every(v => !isNaN(Date.parse(v)));
  }

  private static isEmailData(values: string[]): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return values.length > 0 && values.every(v => emailRegex.test(v));
  }

  private static isPhoneData(values: string[]): boolean {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{7,}$/;
    return values.length > 0 && values.every(v => phoneRegex.test(v));
  }

  private static hasSpecialCharacters(values: string[]): boolean {
    const specialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
    return values.some(v => specialChars.test(v));
  }

  private static calculateAverageLength(values: string[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v.length, 0) / values.length;
  }

  private static extractPatterns(values: string[]): string[] {
    const patterns: string[] = [];

    if (this.isNumericData(values)) patterns.push('numeric');
    if (this.isDateData(values)) patterns.push('date');
    if (this.isEmailData(values)) patterns.push('email');
    if (this.isPhoneData(values)) patterns.push('phone');
    if (this.hasSpecialCharacters(values)) patterns.push('special_chars');

    return patterns;
  }

  private static getEmptyPatterns(): DataPatterns {
    return {
      isNumeric: false,
      isDate: false,
      isEmail: false,
      isPhone: false,
      hasSpecialChars: false,
      avgLength: 0,
      uniqueValues: 0,
      nullCount: 0,
      patterns: []
    };
  }
}

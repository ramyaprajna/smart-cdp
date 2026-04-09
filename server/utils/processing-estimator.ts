/**
 * Processing Time Estimation Utilities
 * Provides accurate time estimates for file processing operations
 */

export interface ProcessingMetrics {
  estimatedTime: string;
  complexity: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export class ProcessingEstimator {
  private static readonly BASE_PROCESSING_RATES = {
    excel: 7500, // rows per second
    csv: 15000,  // rows per second
    txt: 10000,  // rows per second
    docx: 5000   // rows per second
  };

  private static readonly COMPLEXITY_THRESHOLDS = {
    low: 1000,    // rows
    medium: 10000, // rows
    high: 50000   // rows
  };

  /**
   * Estimate processing time for a file
   */
  static estimateProcessingTime(
    totalRows: number,
    fileSize: number,
    fileType: keyof typeof ProcessingEstimator.BASE_PROCESSING_RATES = 'csv'
  ): string {
    const baseRate = this.BASE_PROCESSING_RATES[fileType] || this.BASE_PROCESSING_RATES.csv;

    // Account for file size impact (larger files = slower per row)
    const sizeMultiplier = this.calculateSizeMultiplier(fileSize);
    const effectiveRate = baseRate / sizeMultiplier;

    // Calculate base time
    const baseTimeSeconds = totalRows / effectiveRate;

    // Add overhead for validation and processing
    const overheadMultiplier = this.calculateOverheadMultiplier(totalRows);
    const totalTimeSeconds = baseTimeSeconds * overheadMultiplier;

    return this.formatEstimatedTime(totalTimeSeconds);
  }

  /**
   * Get comprehensive processing metrics
   */
  static getProcessingMetrics(
    totalRows: number,
    fileSize: number,
    fileType: keyof typeof ProcessingEstimator.BASE_PROCESSING_RATES = 'csv'
  ): ProcessingMetrics {
    const estimatedTime = this.estimateProcessingTime(totalRows, fileSize, fileType);
    const complexity = this.determineComplexity(totalRows, fileSize);
    const recommendations = this.generateRecommendations(totalRows, fileSize, fileType);

    return {
      estimatedTime,
      complexity,
      recommendations
    };
  }

  private static calculateSizeMultiplier(fileSize: number): number {
    // Files larger than 10MB start to have performance impact
    const sizeMB = fileSize / (1024 * 1024);
    if (sizeMB < 1) return 1;
    if (sizeMB < 10) return 1 + (sizeMB - 1) * 0.1;
    return 1.9 + (sizeMB - 10) * 0.05; // Diminishing returns
  }

  private static calculateOverheadMultiplier(totalRows: number): number {
    // More rows = relatively less overhead per row
    if (totalRows < 100) return 2.0;
    if (totalRows < 1000) return 1.5;
    if (totalRows < 10000) return 1.3;
    return 1.2;
  }

  private static determineComplexity(totalRows: number, fileSize: number): 'low' | 'medium' | 'high' {
    const sizeMB = fileSize / (1024 * 1024);

    if (totalRows > this.COMPLEXITY_THRESHOLDS.high || sizeMB > 50) {
      return 'high';
    }
    if (totalRows > this.COMPLEXITY_THRESHOLDS.medium || sizeMB > 10) {
      return 'medium';
    }
    return 'low';
  }

  private static generateRecommendations(
    totalRows: number,
    fileSize: number,
    fileType: string
  ): string[] {
    const recommendations: string[] = [];
    const sizeMB = fileSize / (1024 * 1024);

    if (totalRows > 50000) {
      recommendations.push("Consider processing file in smaller batches");
    }

    if (sizeMB > 25) {
      recommendations.push("Large file detected - ensure stable internet connection");
    }

    if (fileType === 'excel' && totalRows > 10000) {
      recommendations.push("Excel files with many rows may process slower than CSV");
    }

    if (totalRows > 10000) {
      recommendations.push("Preview shows sample data - full import will process all rows");
    }

    return recommendations;
  }

  private static formatEstimatedTime(seconds: number): string {
    if (seconds < 1) return "< 1 second";
    if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
    return `${Math.ceil(seconds / 3600)} hours`;
  }
}

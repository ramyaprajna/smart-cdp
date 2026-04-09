/**
 * OpenAI Prompt Builder Utility
 *
 * Centralized utility for creating consistent OpenAI prompts across services.
 * Eliminates duplication and ensures consistent prompt engineering patterns.
 *
 * Created: August 11, 2025 - Refactoring consolidation
 */

import OpenAI from 'openai';
import { secureLogger } from '../utils/secure-logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface PromptConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

interface AnalysisPromptData {
  columnName: string;
  samples: any[];
  patterns: any;
  headers?: string[];
  context?: any;
}

export class OpenAIPromptBuilder {
  private static readonly DEFAULT_CONFIG: PromptConfig = {
    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    temperature: 0.1,
    maxTokens: 1000
  };

  /**
   * Create analysis prompt for column mapping
   */
  static createColumnAnalysisPrompt(data: AnalysisPromptData, coreFields: any[]): string {
    const { columnName, samples, patterns, headers = [], context } = data;

    const contextSection = context ? `
Data Source Context: ${context.displayName || ''}
Industry: ${context.description || ''}
Available Custom Fields: ${Object.keys(context.fieldDefinitions || {}).join(', ')}
Mapping Templates: ${JSON.stringify(context.mappingTemplates || {}, null, 2)}
` : '';

    return `
Analyze this data column for customer data platform mapping:

Column Name: "${columnName}"
Data Patterns: ${JSON.stringify(patterns, null, 2)}
Sample Data: ${JSON.stringify(samples.slice(0, 5), null, 2)}
All Headers: ${headers.join(', ')}

Core Customer Fields Available:
${coreFields.map(f => `- ${f.name}: ${f.description}`).join('\n')}

${contextSection}

Please provide analysis in this JSON format:
{
  "suggestedField": "field_name or null",
  "confidence": 85,
  "dataType": "text|number|date|boolean|array|object|email|phone",
  "targetSystem": "core|attributes|events",
  "reasoning": "Detailed explanation of mapping decision",
  "warnings": ["Any data quality or mapping concerns"],
  "shouldExclude": false,
  "exclusionReason": "Reason if should exclude",
  "transformationRules": ["Any data transformations needed"]
}

Guidelines:
1. Map to "core" fields when data clearly matches standard customer attributes
2. Use high confidence (80+) for clear matches, lower for ambiguous data
3. Include transformation rules for data that needs cleaning or conversion
4. Consider cultural and international variations in data formats
`;
  }

  /**
   * Create system prompt for chatbot with data context
   */
  static createChatbotSystemPrompt(dataContext: any): string {
    return `You are a data scientist with direct database access for Smart CDP Platform's Customer Data Platform. You analyze customer data and provide insights about the customer base using real database results.

CRITICAL INSTRUCTIONS:
- When you receive "Direct Data Analysis Results" in the context, use ONLY those exact numbers
- NEVER suggest querying the database - you already have the results
- Provide specific analytics based on the data provided
- Act as a data scientist who has already run the queries

DATA SOURCE CONTEXT (Evidence-Based):
${dataContext.businessContext}

CURRENT DATASET:
- Total Records: ${dataContext.totalCustomers}
- Data Sources: ${dataContext.dataSources.join(', ')}
- Geographic Coverage: ${dataContext.geographicScope}
- Customer Segments: ${dataContext.segments.join(', ')}
- Data Types: ${dataContext.dataTypes.join(', ')}

CAPABILITIES:
- Query customer database for specific data insights
- Analyze data completeness (phone numbers, demographics, etc.)
- Provide insights on customer behavior patterns
- Calculate missing data percentages and data quality metrics
- Suggest marketing strategies based on actual data
- Explain vector similarity search results
- Recommend data-driven business decisions

TONE: Professional yet conversational, data-driven, focused on actionable insights based on the actual dataset characteristics.

Always provide specific numbers and percentages from the actual database. Keep responses concise and practical.`;
  }

  /**
   * Execute OpenAI chat completion with consistent configuration
   */
  static async executeCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    config: Partial<PromptConfig> = {}
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    return await openai.chat.completions.create({
      model: finalConfig.model!,
      messages,
      response_format: { type: "json_object" },
      temperature: finalConfig.temperature,
      max_tokens: finalConfig.maxTokens
    });
  }

  /**
   * Parse and validate OpenAI response
   */
  static parseResponse<T = any>(response: OpenAI.Chat.Completions.ChatCompletion, fallback: T): T {
    try {
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI response missing content');
      }
      return JSON.parse(content);
    } catch (error) {
      secureLogger.error('Failed to parse OpenAI response:', { error: String(error) });
      return fallback;
    }
  }

  /**
   * Create standard data analysis system prompt
   */
  static createAnalysisSystemPrompt(): string {
    return `You are an expert data analyst specializing in customer data mapping and analysis.
Your task is to analyze data columns and suggest appropriate mappings to a customer database schema.

Rules:
1. Always respond with valid JSON
2. Provide confidence scores between 0-100
3. Give clear reasoning for mapping decisions
4. Consider international data formats and cultural variations
5. Flag potential data quality issues
6. Suggest appropriate transformations when needed

Be precise, analytical, and helpful in your assessments.`;
  }

  /**
   * Create segment analysis prompt for AI suggestions
   */
  static createSegmentAnalysisPrompt(customerData: any, analysisContext: any): string {
    return `Analyze this customer base and generate strategic segmentation suggestions:

Customer Base Summary:
- Total Customers: ${customerData.totalCustomers}
- Average Lifetime Value: $${Math.round(customerData.avgLifetimeValue)}
- Data Quality Score: ${Math.round(customerData.avgDataQuality * 100)}%

Demographics:
${JSON.stringify(customerData.demographics, null, 2)}

Engagement Patterns:
${JSON.stringify(customerData.engagement, null, 2)}

Business Metrics:
${JSON.stringify(customerData.businessMetrics, null, 2)}

Generate 3-5 high-value customer segments in this JSON format:
{
  "segments": [
    {
      "name": "Segment Name",
      "description": "Clear description of the segment",
      "criteria": {
        "conditions": ["specific conditions"],
        "logic": "AND|OR"
      },
      "businessValue": "high|medium|low",
      "estimatedSize": 150,
      "confidence": 85,
      "keyCharacteristics": ["characteristic 1", "characteristic 2"],
      "suggestedActions": ["action 1", "action 2"],
      "reasoning": "Why this segment is valuable"
    }
  ]
}

Focus on segments with:
1. Clear business value and actionable insights
2. Sufficient size to be meaningful (minimum 20 customers)
3. Distinct characteristics that enable targeted strategies
4. High confidence based on available data patterns`;
  }
}

/**
 * Centralized OpenAI Client Configuration
 *
 * This module provides a single, properly validated OpenAI client instance
 * to prevent runtime crashes from missing API keys and ensure consistent
 * configuration across all services.
 */

import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

/**
 * Initialize and return a singleton OpenAI client with proper validation
 */
export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for AI functionality');
  }

  openaiClient = new OpenAI({
    apiKey,
    timeout: 60000, // 60 second timeout (aligned with batch service expectations)
    maxRetries: 2
  });

  return openaiClient;
}

/**
 * Check if OpenAI is properly configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetOpenAIClient(): void {
  openaiClient = null;
}

import { apiRequest } from "./queryClient";
import { z } from 'zod';

// Input validation schemas to fix security vulnerabilities
const CustomerFilterSchema = z.object({
  segment: z.string().optional(),
  dataQualityMin: z.number().min(0).max(100).optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  missingEmail: z.boolean().optional(),
  missingPhone: z.boolean().optional(),
  search: z.string().optional(),
  offset: z.number().min(0).optional(),
  limit: z.number().min(1).max(1000).optional()
});

const CreateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  currentAddress: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  customerSegment: z.string().optional(),
  lifetimeValue: z.number().min(0).optional(),
  dataQualityScore: z.number().min(0).max(100).optional(),
  customAttributes: z.record(z.any()).optional()
});

const UpdateCustomerSchema = CreateCustomerSchema.partial();

const CustomerEventSchema = z.object({
  eventType: z.string().min(1).max(100),
  eventData: z.record(z.any()).optional(),
  eventTimestamp: z.date().optional()
});

const SimilaritySearchSchema = z.object({
  query: z.string().min(1).max(500),
  threshold: z.number().min(0).max(1).default(0.7),
  limit: z.number().min(1).max(100).default(20)
});

const FindSimilarToCustomerSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.75),
  limit: z.number().min(1).max(100).default(15)
});

const EmbeddingGenerationSchema = z.object({
  embeddingType: z.string().default("customer_profile")
});

// Additional schemas for missing API functions
const CreateSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: z.record(z.any()),
  description: z.string().optional(),
  estimatedSize: z.number().optional(),
  isActive: z.boolean().default(true)
});

const CreateSegmentFromAISchema = z.object({
  criteria: z.record(z.any()),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  analysisData: z.record(z.any()).optional()
});

const ImportCustomerDataSchema = z.object({
  customers: z.array(z.object({
    firstName: z.string(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    currentAddress: z.string().optional(),
    customerSegment: z.string().optional(),
    customAttributes: z.record(z.any()).optional()
  })),
  importMetadata: z.record(z.any()).optional()
});

export async function searchCustomers(query: string) {
  const response = await apiRequest("GET", `/api/customers/search?q=${encodeURIComponent(query)}`);
  return response.json();
}

export async function getCustomers(offset = 0, limit = 50) {
  const response = await apiRequest("GET", `/api/customers?offset=${offset}&limit=${limit}`);
  return response.json();
}

export async function getFilteredCustomers(filters: unknown) {
  const validatedFilters = CustomerFilterSchema.parse(filters);
  const response = await apiRequest("POST", "/api/customers/filter", validatedFilters);
  return response.json();
}

export async function getCustomer(id: string) {
  // Validate ID format
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const response = await apiRequest("GET", `/api/customers/${id}`);
  return response.json();
}

export async function createCustomer(customer: unknown) {
  const validatedCustomer = CreateCustomerSchema.parse(customer);
  const response = await apiRequest("POST", "/api/customers", validatedCustomer);
  return response.json();
}

export async function updateCustomer(id: string, customer: unknown) {
  // Validate ID format
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const validatedCustomer = UpdateCustomerSchema.parse(customer);
  const response = await apiRequest("PUT", `/api/customers/${id}`, validatedCustomer);
  return response.json();
}

export async function getCustomerEvents(id: string) {
  // Validate ID format
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const response = await apiRequest("GET", `/api/customers/${id}/events`);
  return response.json();
}

export async function createCustomerEvent(id: string, event: unknown) {
  // Validate ID format
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const validatedEvent = CustomerEventSchema.parse(event);
  const response = await apiRequest("POST", `/api/customers/${id}/events`, validatedEvent);
  return response.json();
}

export async function findSimilarCustomers(query: string, threshold = 0.7, limit = 20) {
  const validatedParams = SimilaritySearchSchema.parse({ query, threshold, limit });
  const response = await apiRequest("POST", "/api/customers/similarity-search", validatedParams);
  return response.json();
}

export async function getVectorSegmentAnalysis() {
  const response = await apiRequest("GET", "/api/vector-secure/segment-analysis");
  return response.json();
}

export async function findSimilarToCustomer(customerId: string, threshold = 0.75, limit = 15) {
  // Validate customer ID
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const validatedParams = FindSimilarToCustomerSchema.parse({ threshold, limit });
  const response = await apiRequest("POST", `/api/vector-secure/find-similar/${customerId}`, validatedParams);
  return response.json();
}

export async function getClusterAnalysis() {
  const response = await apiRequest("GET", "/api/vector-secure/cluster-analysis");
  return response.json();
}

export async function generateCustomerEmbedding(id: string, embeddingType = "customer_profile") {
  // Validate customer ID
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid customer ID provided');
  }
  const validatedParams = EmbeddingGenerationSchema.parse({ embeddingType });
  const response = await apiRequest("POST", `/api/customers/${id}/embedding`, validatedParams);
  return response.json();
}

export async function getSegments() {
  const response = await apiRequest("GET", "/api/segments");
  return response.json();
}

export async function createSegment(segment: unknown) {
  const validatedSegment = CreateSegmentSchema.parse(segment);
  const response = await apiRequest("POST", "/api/segments", validatedSegment);
  return response.json();
}

export async function generateAISegmentSuggestions() {
  const response = await apiRequest("POST", "/api/ai/segment-suggestions");
  return response.json();
}

export async function createSegmentFromAI(segmentData: unknown) {
  const validatedSegmentData = CreateSegmentFromAISchema.parse(segmentData);
  const response = await apiRequest("POST", "/api/segments/from-ai", validatedSegmentData);
  return response.json();
}

export async function getAnalyticsStats() {
  const response = await apiRequest("GET", "/api/analytics/stats");
  return response.json();
}

export async function getSegmentDistribution() {
  const response = await apiRequest("GET", "/api/analytics/segment-distribution");
  return response.json();
}

export async function importCustomerData(data: unknown) {
  const validatedData = ImportCustomerDataSchema.parse(data);
  const response = await apiRequest("POST", "/api/data/import", validatedData);
  return response.json();
}

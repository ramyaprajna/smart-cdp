import { apiRequest } from "./queryClient";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Stream {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  sourceType: string;
  status: "draft" | "active" | "archived";
  entityType?: string;
  schemaDefinition?: SchemaDefinition;
  totalRecords: number;
  identifiedRecords: number;
  identityRate: number;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  dataType: "string" | "number" | "date" | "boolean" | "json";
  group: "identity" | "demographic" | "behavioral" | "transactional" | "metadata";
  isIdentifier: boolean;
  identifierType?: string;
  isRequired?: boolean;
  isPII?: boolean;
  sampleValues?: string[];
  description?: string;
}

export interface IdentityField {
  key: string;
  identifierType: string;
  confidence: number;
  isPrimary: boolean;
}

export interface SchemaDefinition {
  fields: FieldDefinition[];
  identityFields?: IdentityField[];
  suggestedSegments?: string[];
  embeddingTemplate?: string;
  analyticsConfig?: {
    groupByFields?: string[];
    timeField?: string;
  };
}

export interface AIAnalysisResult {
  streamType: string;
  entityType: string;
  confidence: number;
  fieldsDetected: number;
  identityFields: IdentityField[];
  suggestedSchema: SchemaDefinition;
  notes?: string;
}

export interface StreamRecord {
  id: string;
  streamId: string;
  externalId?: string;
  attributes: Record<string, unknown>;
  identityClusterId?: string;
  identityClusterLabel?: string;
  createdAt: string;
}

export interface IdentityCluster {
  id: string;
  projectId: string;
  label?: string;
  streamCount: number;
  recordCount: number;
  primaryIdentifiers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterDetail extends IdentityCluster {
  records: StreamRecord[];
}

export interface ProjectStats {
  totalRecords: number;
  identifiedRecords: number;
  identityRate: number;
  clusterCount: number;
  streamCount: number;
  activeStreamCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Streams ────────────────────────────────────────────────────────────────────

export async function getStreams(projectId?: string, status?: string): Promise<Stream[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (status) params.set("status", status);
  const qs = params.toString();
  const res = await apiRequest("GET", `/api/lite-cdp/streams${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function getStream(streamId: string): Promise<Stream> {
  const res = await apiRequest("GET", `/api/lite-cdp/streams/${streamId}`);
  return res.json();
}

export async function createStream(data: {
  name: string;
  description?: string;
  sourceType: string;
}): Promise<Stream> {
  const res = await apiRequest("POST", "/api/lite-cdp/streams", data);
  return res.json();
}

export async function updateStreamSchema(streamId: string, schema: SchemaDefinition): Promise<Stream> {
  const res = await apiRequest("PUT", `/api/lite-cdp/streams/${streamId}/schema`, { schema });
  return res.json();
}

export async function activateStream(streamId: string): Promise<Stream> {
  const res = await apiRequest("POST", `/api/lite-cdp/streams/${streamId}/activate`);
  return res.json();
}

export async function archiveStream(streamId: string): Promise<Stream> {
  const res = await apiRequest("POST", `/api/lite-cdp/streams/${streamId}/archive`);
  return res.json();
}

export async function uploadStreamFile(streamId: string, file: File): Promise<{ uploaded: boolean; filename: string; rowCount?: number }> {
  const formData = new FormData();
  formData.append("file", file);
  // Use native fetch for multipart — apiRequest wraps JSON by default
  const res = await fetch(`/api/lite-cdp/streams/${streamId}/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Upload failed");
  }
  return res.json();
}

export async function analyzeStream(streamId: string): Promise<AIAnalysisResult> {
  const res = await apiRequest("POST", `/api/lite-cdp/streams/${streamId}/analyze`);
  return res.json();
}

// ── Records ────────────────────────────────────────────────────────────────────

export async function getStreamRecords(
  streamId: string,
  params: { page?: number; pageSize?: number; filters?: unknown[]; sortBy?: string; sortDir?: "asc" | "desc" } = {}
): Promise<PaginatedResponse<StreamRecord>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.filters?.length) qs.set("filters", JSON.stringify(params.filters));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const res = await apiRequest("GET", `/api/lite-cdp/streams/${streamId}/records?${qs.toString()}`);
  return res.json();
}

export async function getRecord(recordId: string): Promise<StreamRecord> {
  const res = await apiRequest("GET", `/api/lite-cdp/records/${recordId}`);
  return res.json();
}

// ── Identity Clusters ──────────────────────────────────────────────────────────

export async function getClusters(
  projectId: string,
  params: { page?: number; pageSize?: number; minStreamCount?: number; search?: string } = {}
): Promise<PaginatedResponse<IdentityCluster>> {
  const qs = new URLSearchParams({ projectId });
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.minStreamCount) qs.set("minStreamCount", String(params.minStreamCount));
  if (params.search) qs.set("search", params.search);
  const res = await apiRequest("GET", `/api/lite-cdp/clusters?${qs.toString()}`);
  return res.json();
}

export async function getClusterDetail(clusterId: string): Promise<ClusterDetail> {
  const res = await apiRequest("GET", `/api/lite-cdp/clusters/${clusterId}`);
  return res.json();
}

export async function linkRecordToCluster(
  clusterId: string,
  data: { recordId: string; linkType: string; confidence: number }
): Promise<void> {
  await apiRequest("POST", `/api/lite-cdp/clusters/${clusterId}/link`, data);
}

export async function unlinkRecord(clusterId: string, recordId: string): Promise<void> {
  await apiRequest("DELETE", `/api/lite-cdp/clusters/${clusterId}/link/${recordId}`);
}

export async function mergeClusters(data: {
  clusterAId: string;
  clusterBId: string;
  reason?: string;
}): Promise<IdentityCluster> {
  const res = await apiRequest("POST", "/api/lite-cdp/clusters/merge", data);
  return res.json();
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const res = await apiRequest("GET", `/api/lite-cdp/stats/${projectId}`);
  return res.json();
}

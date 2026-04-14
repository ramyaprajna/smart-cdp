/**
 * Hooks — Identity Cluster Data
 *
 * TanStack Query v5 hooks for reading and mutating identity cluster data
 * via the Lite CDP v2 API.
 *
 * Hooks:
 *  - useClusters          — paginated list of clusters with optional search
 *  - useClusterDetail     — single cluster with linked records
 *  - useLinkRecord        — manually link a record to a cluster
 *  - useUnlinkRecord      — remove a record from a cluster
 *  - useMergeClusters     — merge two clusters into one
 *
 * @module use-cluster-data
 * @created 2025 — Lite CDP v2 Sprint 5
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClusterListParams {
  page: number;
  pageSize?: number;
  minStreamCount?: number;
  search?: string;
  projectId?: string;
}

export interface ClusterRecord {
  id: string;
  streamId: string;
  projectId: string;
  attributes: Record<string, unknown>;
  identityClusterId: string | null;
  createdAt: string;
}

export interface IdentityCluster {
  id: string;
  projectId: string;
  masterIdentifiers: Record<string, unknown>;
  streamCount: number;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterDetailResponse {
  cluster: IdentityCluster;
  records: ClusterRecord[];
  links: Array<{
    id: string;
    recordId: string;
    linkType: string;
    confidence: number;
    linkedAt: string;
  }>;
  pagination: { page: number; pageSize: number; total: number };
}

export interface ClusterListResponse {
  clusters: IdentityCluster[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

// ─── useClusters ──────────────────────────────────────────────────────────────

/**
 * Paginated list of identity clusters.
 *
 * @example
 * const { data, isLoading } = useClusters({ page: 1, pageSize: 20, search: 'john' });
 */
export function useClusters(params: ClusterListParams) {
  return useQuery<ClusterListResponse>({
    queryKey: ['/api/lite-cdp/clusters', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', params.page.toString());
      if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());
      if (params.minStreamCount != null)
        searchParams.set('minStreamCount', params.minStreamCount.toString());
      if (params.search) searchParams.set('search', params.search);
      if (params.projectId) searchParams.set('projectId', params.projectId);

      const res = await apiRequest('GET', `/api/lite-cdp/clusters?${searchParams.toString()}`);
      return res.json();
    },
    enabled: true,
  });
}

// ─── useClusterDetail ─────────────────────────────────────────────────────────

/**
 * Fetch a single cluster with its linked records and link metadata.
 * Query is skipped when clusterId is undefined.
 *
 * @example
 * const { data } = useClusterDetail(selectedClusterId);
 */
export function useClusterDetail(clusterId: string | undefined) {
  return useQuery<ClusterDetailResponse>({
    queryKey: ['/api/lite-cdp/clusters', clusterId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/lite-cdp/clusters/${clusterId}`);
      return res.json();
    },
    enabled: Boolean(clusterId),
  });
}

// ─── useLinkRecord ────────────────────────────────────────────────────────────

/**
 * Manually link a record to a cluster.
 *
 * Invalidates both the specific cluster detail and the cluster list on success.
 *
 * @example
 * const link = useLinkRecord(clusterId);
 * link.mutate({ recordId, linkType: 'manual', confidence: 1.0 });
 */
export function useLinkRecord(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { recordId: string; linkType: string; confidence: number }>({
    mutationFn: async (data) => {
      await apiRequest('POST', `/api/lite-cdp/clusters/${clusterId}/link`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/clusters', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/clusters'] });
    },
  });
}

// ─── useUnlinkRecord ──────────────────────────────────────────────────────────

/**
 * Remove a record from a cluster (unlink).
 *
 * Invalidates both the specific cluster detail and the cluster list on success.
 *
 * @example
 * const unlink = useUnlinkRecord(clusterId);
 * unlink.mutate(recordId);
 */
export function useUnlinkRecord(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (recordId) => {
      await apiRequest('DELETE', `/api/lite-cdp/clusters/${clusterId}/link/${recordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/clusters', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/clusters'] });
    },
  });
}

// ─── useMergeClusters ─────────────────────────────────────────────────────────

/**
 * Merge two identity clusters into a single canonical cluster.
 *
 * Invalidates the full cluster list on success.
 *
 * @example
 * const merge = useMergeClusters();
 * merge.mutate({ clusterAId, clusterBId, reason: 'Same person confirmed by agent' });
 */
export function useMergeClusters() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { clusterAId: string; clusterBId: string; reason?: string }
  >({
    mutationFn: async (data) => {
      await apiRequest('POST', '/api/lite-cdp/clusters/merge', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/clusters'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Hook untuk stream list
export function useStreams(projectId?: string, status?: string) {
  return useQuery({
    queryKey: ['/api/lite-cdp/streams', { projectId, status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (status) params.set('status', status);
      const res = await apiRequest('GET', `/api/lite-cdp/streams?${params}`);
      return res.json();
    },
  });
}

// Hook untuk single stream
export function useStream(streamId: string | undefined) {
  return useQuery({
    queryKey: ['/api/lite-cdp/streams', streamId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/lite-cdp/streams/${streamId}`);
      return res.json();
    },
    enabled: !!streamId,
  });
}

// Hook untuk stream records (paginated)
export function useStreamRecords(
  streamId: string | undefined,
  params: {
    page: number;
    pageSize: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    filters?: Array<{ field: string; operator: string; value: unknown }>;
  }
) {
  return useQuery({
    queryKey: ['/api/lite-cdp/streams', streamId, 'records', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('page', String(params.page));
      searchParams.set('pageSize', String(params.pageSize));
      if (params.sortField) searchParams.set('sortField', params.sortField);
      if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
      if (params.filters && params.filters.length > 0) {
        searchParams.set('filters', JSON.stringify(params.filters));
      }
      const res = await apiRequest(
        'GET',
        `/api/lite-cdp/streams/${streamId}/records?${searchParams}`
      );
      return res.json();
    },
    enabled: !!streamId,
  });
}

// Hook untuk stream stats
export function useStreamStats(streamId: string | undefined) {
  return useQuery({
    queryKey: ['/api/lite-cdp/streams', streamId, 'stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/lite-cdp/streams/${streamId}/stats`);
      return res.json();
    },
    enabled: !!streamId,
  });
}

// Hook untuk project stats
export function useProjectStats(projectId: string) {
  return useQuery({
    queryKey: ['/api/lite-cdp/stats', projectId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/lite-cdp/stats/${projectId}`);
      return res.json();
    },
    enabled: !!projectId,
  });
}

// Mutation hooks

export function useCreateStream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      projectId: string;
      entityType?: string;
    }) => {
      const res = await apiRequest('POST', '/api/lite-cdp/streams', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams'] });
    },
  });
}

export function useUpdateStreamSchema() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      streamId,
      schemaDefinition,
      analyticsConfig,
    }: {
      streamId: string;
      schemaDefinition?: unknown;
      analyticsConfig?: unknown;
    }) => {
      const res = await apiRequest('PUT', `/api/lite-cdp/streams/${streamId}/schema`, {
        schemaDefinition,
        analyticsConfig,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams', variables.streamId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams'] });
    },
  });
}

export function useActivateStream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (streamId: string) => {
      const res = await apiRequest('POST', `/api/lite-cdp/streams/${streamId}/activate`);
      return res.json();
    },
    onSuccess: (_data, streamId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams', streamId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams'] });
    },
  });
}

export function useArchiveStream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (streamId: string) => {
      const res = await apiRequest('POST', `/api/lite-cdp/streams/${streamId}/archive`);
      return res.json();
    },
    onSuccess: (_data, streamId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams', streamId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams'] });
    },
  });
}

export function useUploadStreamFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ streamId, file }: { streamId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/lite-cdp/streams/${streamId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/lite-cdp/streams', variables.streamId, 'records'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams', variables.streamId] });
    },
  });
}

export function useAnalyzeStream() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (streamId: string) => {
      const res = await apiRequest('POST', `/api/lite-cdp/streams/${streamId}/analyze`);
      return res.json();
    },
    onSuccess: (_data, streamId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lite-cdp/streams', streamId] });
    },
  });
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface ProgressUpdate {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  processedCustomers: number;
  totalCustomers: number;
  generatedEmbeddings: number;
  failedEmbeddings: number;
  progressPercentage: number;
  currentBatch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: string;
  batchTimingMetrics?: {
    averageBatchTime: number;
    lastBatchTime: number;
    batchesPerMinute: number;
  };
  retryAttempts?: number;
  errors?: string[];
  timestamp: string;
}

interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastError?: string;
  reconnectAttempts: number;
}

interface UseEmbeddingProgressWebSocketOptions {
  enabled?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseEmbeddingProgressWebSocketReturn {
  progressUpdate: ProgressUpdate | null;
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
}

export function useEmbeddingProgressWebSocket(
  options: UseEmbeddingProgressWebSocketOptions = {}
): UseEmbeddingProgressWebSocketReturn {
  const {
    enabled = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 3000
  } = options;

  const { isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0
  });

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !isAuthenticated) {
      console.log('[WebSocket] Connection disabled:', { enabled, isAuthenticated });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token || token.trim().length === 0) {
      console.log('[WebSocket] No valid authentication token found');
      setConnectionState(prev => ({
        ...prev,
        lastError: 'Authentication token not available'
      }));
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Connection already active, skipping new connection');
      return;
    }

    setConnectionState(prev => ({ 
      ...prev, 
      isConnecting: true, 
      lastError: undefined 
    }));

    try {
      // Get the current window location for WebSocket URL construction
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      
      // Fix port resolution issue - ensure we have a valid host with port
      let wsHost = host;
      if (!host || host.includes('undefined')) {
        // Fallback to current location with explicit port handling
        const currentHost = window.location.hostname;
        const currentPort = window.location.port || (protocol === 'wss:' ? '443' : '80');
        wsHost = currentPort === '80' || currentPort === '443' ? currentHost : `${currentHost}:${currentPort}`;
      }
      
      const wsUrl = `${protocol}//${wsHost}/api/ws/embedding-progress?token=${encodeURIComponent(token)}`;
      
      console.log('[WebSocket] Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***'));
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Connected to embedding progress stream');
        setConnectionState({
          isConnected: true,
          isConnecting: false,
          reconnectAttempts: 0,
          lastError: undefined
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types from backend
          if (data.type === 'progress_update') {
            // Transform backend data structure to frontend format
            const backendData = data.data || {};
            const transformedUpdate: ProgressUpdate = {
              jobId: data.importId || backendData.importId || 'unknown',
              status: backendData.status || 'pending',
              processedCustomers: backendData.processedCustomers || 0,
              totalCustomers: backendData.totalCustomers || 0,
              generatedEmbeddings: backendData.generatedEmbeddings || 0,
              failedEmbeddings: backendData.failedEmbeddings || 0,
              progressPercentage: backendData.totalCustomers > 0 
                ? Math.round((backendData.processedCustomers / backendData.totalCustomers) * 100)
                : 0,
              currentBatch: backendData.currentBatch,
              totalBatches: backendData.totalBatches,
              // Convert milliseconds to readable time if available
              estimatedTimeRemaining: backendData.estimatedTimeRemainingMs 
                ? formatTimeRemaining(backendData.estimatedTimeRemainingMs)
                : undefined,
              batchTimingMetrics: backendData.averageBatchTimeMs ? {
                averageBatchTime: backendData.averageBatchTimeMs || 0,
                lastBatchTime: backendData.lastBatchTimeMs || 0,
                batchesPerMinute: backendData.throughputPerSecond 
                  ? backendData.throughputPerSecond * 60 
                  : 0
              } : undefined,
              retryAttempts: backendData.retryAttempts || 0,
              timestamp: backendData.lastUpdatedAt || new Date().toISOString()
            };
            setProgressUpdate(transformedUpdate);
          } else if (data.type === 'subscription_confirmed') {
            console.log('[WebSocket] Subscription confirmed for import:', data.importId);
            // Handle initial data if provided
            if (data.initialData) {
              const transformedUpdate: ProgressUpdate = {
                jobId: data.importId,
                status: data.initialData.status || 'pending',
                processedCustomers: data.initialData.processedCustomers || 0,
                totalCustomers: data.initialData.totalCustomers || 0,
                generatedEmbeddings: data.initialData.generatedEmbeddings || 0,
                failedEmbeddings: data.initialData.failedEmbeddings || 0,
                progressPercentage: data.initialData.totalCustomers > 0 
                  ? Math.round((data.initialData.processedCustomers / data.initialData.totalCustomers) * 100)
                  : 0,
                currentBatch: data.initialData.currentBatch,
                totalBatches: data.initialData.totalBatches,
                timestamp: data.initialData.lastUpdatedAt || new Date().toISOString()
              };
              setProgressUpdate(transformedUpdate);
            }
          } else if (data.type === 'connection_established') {
            console.log('[WebSocket] Connection established, client ID:', data.clientId);
          } else if (data.type === 'error') {
            console.error('[WebSocket] Server error:', data.message);
            setConnectionState(prev => ({
              ...prev,
              lastError: data.message
            }));
          } else if (data.type === 'pong') {
            // Handle pong response for heartbeat
            console.log('[WebSocket] Pong received');
          } else {
            console.log('[WebSocket] Unknown message type:', data.type, data);
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      // Helper function to format time remaining
      const formatTimeRemaining = (ms: number): string => {
        if (ms < 60000) {
          return `${Math.round(ms / 1000)}s`;
        } else if (ms < 3600000) {
          return `${Math.round(ms / 60000)}m`;
        } else {
          return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false
        }));

        // Auto-reconnect if the closure was unexpected and we haven't exceeded max attempts
        if (enabled && 
            event.code !== 1000 && // Normal closure
            connectionState.reconnectAttempts < maxReconnectAttempts) {
          
          setConnectionState(prev => ({
            ...prev,
            reconnectAttempts: prev.reconnectAttempts + 1
          }));

          const delay = reconnectDelay * Math.pow(2, connectionState.reconnectAttempts); // Exponential backoff
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${connectionState.reconnectAttempts + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        
        // More detailed error handling
        let errorMessage = 'Connection failed';
        if (error.type === 'error') {
          errorMessage = 'WebSocket connection error - check network or authentication';
        }
        
        setConnectionState(prev => ({
          ...prev,
          lastError: errorMessage,
          isConnecting: false
        }));
      };

    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setConnectionState(prev => ({
        ...prev,
        lastError: 'Failed to create connection',
        isConnecting: false
      }));
    }
  }, [enabled, isAuthenticated, connectionState.reconnectAttempts, maxReconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setConnectionState({
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0
    });
  }, [clearReconnectTimeout]);

  // Auto-connect when enabled and authenticated
  useEffect(() => {
    if (enabled && isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, isAuthenticated, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, [clearReconnectTimeout]);

  return {
    progressUpdate,
    connectionState,
    connect,
    disconnect
  };
}
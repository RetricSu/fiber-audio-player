'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FiberRpcClient, NodeInfo, Channel } from '@/lib/fiber-rpc';

export interface UseFiberNodeResult {
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: NodeInfo | null;
  channels: Channel[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

export function useFiberNode(rpcUrl: string): UseFiberNodeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<FiberRpcClient | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const client = new FiberRpcClient({ url: rpcUrl, timeout: 10000 });
      clientRef.current = client;

      const info = await client.getNodeInfo();
      setNodeInfo(info);

      const channelResult = await client.listChannels();
      setChannels(channelResult.channels || []);

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Fiber node');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [rpcUrl]);

  const disconnect = useCallback(() => {
    clientRef.current = null;
    setIsConnected(false);
    setNodeInfo(null);
    setChannels([]);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const info = await clientRef.current.getNodeInfo();
      setNodeInfo(info);

      const channelResult = await clientRef.current.listChannels();
      setChannels(channelResult.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, []);

  return {
    isConnected,
    isConnecting,
    nodeInfo,
    channels,
    error,
    connect,
    disconnect,
    refresh,
  };
}

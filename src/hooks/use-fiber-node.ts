'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FiberRpcClient, NodeInfo, Channel, PeerInfo, toHex, ckbToShannon, formatShannon } from '@/lib/fiber-rpc';

export type ChannelStatus =
  | 'idle'
  | 'checking'
  | 'no_route'
  | 'opening_channel'
  | 'waiting_confirmation'
  | 'ready'
  | 'error';

export interface UseFiberNodeResult {
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: NodeInfo | null;
  channels: Channel[];
  peers: PeerInfo[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  // Channel setup
  channelStatus: ChannelStatus;
  channelError: string | null;
  channelStateName: string | null;
  channelElapsed: number;
  availableBalance: string;
  checkPaymentRoute: (recipientPubkey: string, amount?: number) => Promise<boolean>;
  setupChannel: (peerId: string, fundingAmountCkb?: number) => Promise<boolean>;
  cancelChannelSetup: () => void;
  // Peer connection
  connectToPeer: (address: string) => Promise<PeerInfo | null>;
  isConnectingPeer: boolean;
  connectPeerError: string | null;
}

const DEFAULT_FUNDING_AMOUNT_CKB = 100; // 100 CKB default funding

export function useFiberNode(rpcUrl: string): UseFiberNodeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<FiberRpcClient | null>(null);

  // Channel status
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelStateName, setChannelStateName] = useState<string | null>(null);
  const [channelElapsed, setChannelElapsed] = useState(0);
  const [availableBalance, setAvailableBalance] = useState('0');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Peer connection state
  const [isConnectingPeer, setIsConnectingPeer] = useState(false);
  const [connectPeerError, setConnectPeerError] = useState<string | null>(null);

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

      const peersResult = await client.listPeers();
      setPeers(peersResult.peers || []);

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Fiber node');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [rpcUrl]);

  const disconnect = useCallback(() => {
    // Clean up any active polling
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    cancelledRef.current = true;

    clientRef.current = null;
    setIsConnected(false);
    setNodeInfo(null);
    setChannels([]);
    setPeers([]);
    setError(null);
    setChannelStatus('idle');
    setChannelError(null);
    setChannelStateName(null);
    setChannelElapsed(0);
    setAvailableBalance('0');
  }, []);

  const refresh = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const info = await clientRef.current.getNodeInfo();
      setNodeInfo(info);

      const channelResult = await clientRef.current.listChannels();
      setChannels(channelResult.channels || []);

      const peersResult = await clientRef.current.listPeers();
      setPeers(peersResult.peers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, []);

  const connectToPeer = useCallback(async (address: string): Promise<PeerInfo | null> => {
    if (!clientRef.current) {
      setConnectPeerError('Not connected to Fiber node');
      return null;
    }

    setIsConnectingPeer(true);
    setConnectPeerError(null);

    try {
      await clientRef.current.connectPeer(address);

      // Refresh peers list
      const peersResult = await clientRef.current.listPeers();
      const updatedPeers = peersResult.peers || [];
      setPeers(updatedPeers);

      // Return the most recently added peer (last in list)
      const newPeer = updatedPeers[updatedPeers.length - 1] ?? null;
      return newPeer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to peer';
      setConnectPeerError(msg);
      return null;
    } finally {
      setIsConnectingPeer(false);
    }
  }, []);

  const checkPaymentRoute = useCallback(
    async (recipientPubkey: string, amount: number = 0.01): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      setChannelStatus('checking');
      setChannelError(null);

      try {
        const client = clientRef.current;
        const testAmount = toHex(ckbToShannon(amount));

        // Check if we can route payments to this recipient
        const canRoute = await client.checkPaymentRoute(recipientPubkey, testAmount);

        if (canRoute) {
          // Check our total channel balance across all ready channels
          const allChannels = await client.listChannels();
          const totalBalance = allChannels.channels
            .filter((ch) => ch.state.state_name === 'ChannelReady')
            .reduce((sum, ch) => sum + BigInt(ch.local_balance), 0n);
          setAvailableBalance(formatShannon(totalBalance));
          setChannelStatus('ready');
          return true;
        }

        // No route available
        setChannelStatus('no_route');
        setChannelError(
          'No payment route to recipient. Click "Open Channel" to create a direct channel.'
        );
        return false;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setChannelError(errMsg);
        setChannelStatus('error');
        return false;
      }
    },
    []
  );

  const cancelChannelSetup = useCallback(() => {
    cancelledRef.current = true;
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    setChannelStatus('idle');
    setChannelStateName(null);
    setChannelElapsed(0);
    setChannelError(null);
  }, []);

  const setupChannel = useCallback(
    async (peerId: string, fundingAmountCkb: number = DEFAULT_FUNDING_AMOUNT_CKB): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      // Clean up any previous polling
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
      cancelledRef.current = false;

      setChannelStatus('opening_channel');
      setChannelError(null);
      setChannelStateName(null);
      setChannelElapsed(0);

      try {
        const client = clientRef.current;
        const fundingAmount = toHex(ckbToShannon(fundingAmountCkb));

        // Open channel directly with peer_id
        await client.openChannel({
          peer_id: peerId,
          funding_amount: fundingAmount,
          public: true,
        });

        // Channel opened — now poll for it to become ready
        setChannelStatus('waiting_confirmation');

        // Start elapsed timer
        const startTime = Date.now();
        elapsedRef.current = setInterval(() => {
          setChannelElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        // Start non-blocking polling using peerId directly
        return new Promise<boolean>((resolve) => {
          let attempts = 0;
          const maxAttempts = 200; // ~10 minutes at 3s intervals
          const pollInterval = 3000;

          const poll = async () => {
            if (cancelledRef.current || !clientRef.current) {
              cleanup();
              resolve(false);
              return;
            }

            attempts++;

            try {
              const channelResult = await clientRef.current.listChannels({ peer_id: peerId });
              const channels = channelResult.channels || [];

              // Find the latest channel for this peer
              const latestChannel = channels[channels.length - 1];
              if (latestChannel) {
                const currentState = latestChannel.state.state_name;
                setChannelStateName(currentState);

                if (currentState === 'ChannelReady') {
                  setAvailableBalance(formatShannon(latestChannel.local_balance));
                  setChannelStatus('ready');
                  setChannelStateName(null);

                  // Refresh channels list
                  const allChannels = await clientRef.current!.listChannels();
                  setChannels(allChannels.channels || []);

                  cleanup();
                  resolve(true);
                  return;
                }

                if (currentState === 'Closed') {
                  setChannelError('Channel was closed unexpectedly');
                  setChannelStatus('error');
                  setChannelStateName(null);
                  cleanup();
                  resolve(false);
                  return;
                }
              }
            } catch (err) {
              console.warn('[fiber] polling error:', err);
              // Non-fatal — keep trying
            }

            if (attempts >= maxAttempts) {
              setChannelError(
                'Channel opening timed out. It may still be pending on-chain — try checking the route again in a minute.'
              );
              setChannelStatus('error');
              setChannelStateName(null);
              cleanup();
              resolve(false);
            }
          };

          const cleanup = () => {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
          };

          // First poll immediately, then on interval
          poll();
          pollingRef.current = setInterval(poll, pollInterval);
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';

        if (errMsg.includes('peer') || errMsg.includes('connect') || errMsg.includes('not found')) {
          setChannelError(
            'Cannot open channel: Peer not connected. The recipient node may be offline or unreachable. ' +
            'Try connecting to the peer first using their full address.'
          );
        } else if (errMsg.includes('insufficient') || errMsg.includes('balance') || errMsg.includes('fund')) {
          setChannelError(
            'Cannot open channel: Insufficient funds. Make sure your node has enough CKB to fund the channel.'
          );
        } else {
          setChannelError(`Failed to open channel: ${errMsg}`);
        }

        setChannelStatus('error');
        return false;
      }
    },
    []
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    nodeInfo,
    channels,
    peers,
    error,
    connect,
    disconnect,
    refresh,
    channelStatus,
    channelError,
    channelStateName,
    channelElapsed,
    availableBalance,
    checkPaymentRoute,
    setupChannel,
    cancelChannelSetup,
    connectToPeer,
    isConnectingPeer,
    connectPeerError,
  };
}

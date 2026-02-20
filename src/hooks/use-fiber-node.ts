'use client';

import { useState, useCallback, useRef } from 'react';
import { FiberRpcClient, NodeInfo, Channel, PeerInfo, ChannelState, toHex, ckbToShannon, formatShannon } from '@/lib/fiber-rpc';

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
  isConnectingPeer: boolean;
  connectPeerError: string | null;
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
  connectToPeer: (address: string) => Promise<PeerInfo | null>;
  checkPaymentRoute: (recipientPubkey: string, amount?: number) => Promise<boolean>;
  setupChannel: (recipientPubkey: string, fundingAmountCkb?: number) => Promise<boolean>;
  cancelChannelSetup: () => void;
}

const DEFAULT_FUNDING_AMOUNT_CKB = 100; // 100 CKB default funding

export function useFiberNode(rpcUrl: string): UseFiberNodeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isConnectingPeer, setIsConnectingPeer] = useState(false);
  const [connectPeerError, setConnectPeerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<FiberRpcClient | null>(null);

  // Channel status
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelStateName, setChannelStateName] = useState<string | null>(null);
  const [channelElapsed, setChannelElapsed] = useState(0);
  const [availableBalance, setAvailableBalance] = useState('0');
  const channelSetupCanceledRef = useRef(false);
  const channelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearChannelTimer = useCallback(() => {
    if (channelTimerRef.current) {
      clearInterval(channelTimerRef.current);
      channelTimerRef.current = null;
    }
  }, []);

  const startChannelTimer = useCallback(() => {
    clearChannelTimer();
    setChannelElapsed(0);
    const startedAt = Date.now();
    channelTimerRef.current = setInterval(() => {
      setChannelElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }, [clearChannelTimer]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const client = new FiberRpcClient({ url: rpcUrl, timeout: 10000 });
      clientRef.current = client;

      const info = await client.nodeInfo();
      setNodeInfo(info);

      const channelResult = await client.listChannels();
      setChannels(channelResult.channels || []);

      const peersResult = await client.listPeers();
      setPeers(peersResult.peers || []);
      setConnectPeerError(null);

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
    setPeers([]);
    setIsConnectingPeer(false);
    setConnectPeerError(null);
    setError(null);
    setChannelStatus('idle');
    setChannelError(null);
    setChannelStateName(null);
    setChannelElapsed(0);
    channelSetupCanceledRef.current = false;
    clearChannelTimer();
    setAvailableBalance('0');
  }, [clearChannelTimer]);

  const refresh = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const info = await clientRef.current.nodeInfo();
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

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setConnectPeerError('Peer address is required');
      return null;
    }

    setIsConnectingPeer(true);
    setConnectPeerError(null);

    try {
      const client = clientRef.current as FiberRpcClient & {
        connectPeer?: (args: { address: string } | string) => Promise<unknown>;
      };

      if (!client.connectPeer) {
        throw new Error('Current Fiber RPC client does not support peer connections');
      }

      try {
        await client.connectPeer({ address: trimmedAddress });
      } catch {
        await client.connectPeer(trimmedAddress);
      }

      const peersResult = await clientRef.current.listPeers();
      const nextPeers = peersResult.peers || [];
      setPeers(nextPeers);

      const peerIdMatch = trimmedAddress.match(/\/p2p\/([^/]+)/);
      const matchedPeer = peerIdMatch
        ? nextPeers.find((peer) => peer.peer_id === peerIdMatch[1])
        : undefined;

      return matchedPeer || nextPeers[nextPeers.length - 1] || null;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to peer';
      setConnectPeerError(errMsg);
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
      setChannelStateName(null);
      setChannelElapsed(0);
      clearChannelTimer();

      try {
        const client = clientRef.current;
        const testAmount = toHex(ckbToShannon(amount));

        // First check for direct ready channel to this recipient.
        // This avoids false negatives when dry-run behavior differs by runtime/proxy mode.
        const recipientPeerId = await client.findPeerIdByPubkey(recipientPubkey);
        const directChannel = recipientPeerId
          ? await client.findChannelToPeer(recipientPeerId)
          : null;

        if (directChannel) {
          setAvailableBalance(formatShannon(directChannel.local_balance));
          setChannelStatus('ready');
          return true;
        }

        // Check if we can route payments to this recipient
        const canRoute = await client.checkPaymentRoute(recipientPubkey, testAmount);

        if (canRoute) {
          // Route exists via network, check our total channel balance
          const allChannels = await client.listChannels();
          const totalBalance = allChannels.channels
            .filter((ch) => ch.state.state_name === ChannelState.ChannelReady)
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
    [clearChannelTimer]
  );

  const cancelChannelSetup = useCallback(() => {
    channelSetupCanceledRef.current = true;
    clearChannelTimer();
    setChannelStatus('idle');
    setChannelError(null);
    setChannelStateName(null);
    setChannelElapsed(0);
  }, [clearChannelTimer]);

  const setupChannel = useCallback(
    async (recipientPubkey: string, fundingAmountCkb: number = DEFAULT_FUNDING_AMOUNT_CKB): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      setChannelStatus('opening_channel');
      setChannelError(null);
      setChannelStateName(null);
      setChannelElapsed(0);
      channelSetupCanceledRef.current = false;
      clearChannelTimer();

      try {
        const client = clientRef.current;
        const fundingAmount = toHex(ckbToShannon(fundingAmountCkb));

        const channelsBefore = await client.listChannels();
        const existingChannelIds = new Set(channelsBefore.channels.map((channel) => channel.channel_id));

        // Find the peer_id for this pubkey and open channel
        await client.openChannelByPubkey(recipientPubkey, fundingAmount, { public: true });

        // Wait for channel to become ready
        setChannelStatus('waiting_confirmation');
        startChannelTimer();

        // We need to find the peer_id to poll for channel status
        const peerId = await client.findPeerIdByPubkey(recipientPubkey);
        if (!peerId) {
          throw new Error('Lost connection to peer');
        }

        // Poll for channel status (check every 3 seconds, up to 5 minutes)
        const maxAttempts = 100;
        const pollInterval = 3000;

        for (let i = 0; i < maxAttempts; i++) {
          if (channelSetupCanceledRef.current) {
            clearChannelTimer();
            setChannelStatus('idle');
            setChannelStateName(null);
            setChannelElapsed(0);
            return false;
          }

          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const channelResult = await client.listChannels();
          const peerChannels = channelResult.channels.filter((channel) => channel.peer_id === peerId);
          const newPeerChannels = peerChannels.filter(
            (channel) => !existingChannelIds.has(channel.channel_id)
          );

          const activeChannel =
            newPeerChannels.find((channel) => channel.state.state_name !== ChannelState.ChannelReady) ||
            newPeerChannels[newPeerChannels.length - 1] ||
            peerChannels.find((channel) => channel.state.state_name !== ChannelState.ChannelReady) ||
            peerChannels[peerChannels.length - 1];

          if (activeChannel?.state?.state_name) {
            setChannelStateName(activeChannel.state.state_name);
          }

          const readyChannel = newPeerChannels.find(
            (ch) => ch.state.state_name === ChannelState.ChannelReady
          );

          if (readyChannel) {
            clearChannelTimer();
            setAvailableBalance(formatShannon(readyChannel.local_balance));
            setChannelStateName(readyChannel.state.state_name);
            setChannelStatus('ready');

            // Refresh channels list
            const allChannels = await client.listChannels();
            setChannels(allChannels.channels || []);

            return true;
          }

          // Check for failed/closed channel
          const failedChannel = newPeerChannels.find(
            (ch) => ch.state.state_name === ChannelState.Closed
          );
          if (failedChannel) {
            setChannelStateName(failedChannel.state.state_name);
            throw new Error('Channel was closed unexpectedly');
          }
        }

        throw new Error('Channel opening timed out. The channel may still be pending on-chain confirmation.');
      } catch (err) {
        clearChannelTimer();
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        const normalizedError = errMsg.toLowerCase();

        // Provide helpful error messages
        if (normalizedError.includes('peer not connected') || normalizedError.includes('not in your peer list')) {
          setChannelError(
            `Cannot open channel: Peer not connected. The recipient node may be offline or unreachable. ` +
            `Try connecting to the peer first using their full address.`
          );
        } else if (normalizedError.includes('insufficient') || normalizedError.includes('balance') || normalizedError.includes('fund')) {
          setChannelError(
            `Cannot open channel: Insufficient funds. Make sure your node has enough CKB to fund the channel.`
          );
        } else {
          setChannelError(`Failed to open channel: ${errMsg}`);
        }

        setChannelStatus('error');
        return false;
      }
    },
    [clearChannelTimer, startChannelTimer]
  );

  return {
    isConnected,
    isConnecting,
    nodeInfo,
    channels,
    peers,
    isConnectingPeer,
    connectPeerError,
    error,
    connect,
    disconnect,
    refresh,
    channelStatus,
    channelError,
    channelStateName,
    channelElapsed,
    availableBalance,
    connectToPeer,
    checkPaymentRoute,
    setupChannel,
    cancelChannelSetup,
  };
}

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
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  // Channel setup
  channelStatus: ChannelStatus;
  channelError: string | null;
  availableBalance: string;
  checkPaymentRoute: (recipientPubkey: string, amount?: number) => Promise<boolean>;
  setupChannel: (recipientPubkey: string, fundingAmountCkb?: number) => Promise<boolean>;
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
  const [availableBalance, setAvailableBalance] = useState('0');

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
    setError(null);
    setChannelStatus('idle');
    setChannelError(null);
    setAvailableBalance('0');
  }, []);

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
          // Check for direct channel to get balance info
          const directChannel = await client.findChannelToPeer(recipientPubkey);
          if (directChannel) {
            setAvailableBalance(formatShannon(directChannel.local_balance));
          } else {
            // Route exists via network, check our total channel balance
            const allChannels = await client.listChannels();
            const totalBalance = allChannels.channels
              .filter((ch) => ch.state.state_name === ChannelState.ChannelReady)
              .reduce((sum, ch) => sum + BigInt(ch.local_balance), 0n);
            setAvailableBalance(formatShannon(totalBalance));
          }
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

  const setupChannel = useCallback(
    async (recipientPubkey: string, fundingAmountCkb: number = DEFAULT_FUNDING_AMOUNT_CKB): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      setChannelStatus('opening_channel');
      setChannelError(null);

      try {
        const client = clientRef.current;
        const fundingAmount = toHex(ckbToShannon(fundingAmountCkb));

        // Find the peer_id for this pubkey and open channel
        await client.openChannelByPubkey(recipientPubkey, fundingAmount, { public: true });

        // Wait for channel to become ready
        setChannelStatus('waiting_confirmation');

        // We need to find the peer_id to poll for channel status
        const peerId = await client.findPeerIdByPubkey(recipientPubkey);
        if (!peerId) {
          throw new Error('Lost connection to peer');
        }

        // Poll for channel status (check every 3 seconds, up to 5 minutes)
        const maxAttempts = 100;
        const pollInterval = 3000;

        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const channelResult = await client.listChannels({ peer_id: peerId });
          const readyChannel = channelResult.channels.find(
            (ch) => ch.state.state_name === ChannelState.ChannelReady
          );

          if (readyChannel) {
            setAvailableBalance(formatShannon(readyChannel.local_balance));
            setChannelStatus('ready');

            // Refresh channels list
            const allChannels = await client.listChannels();
            setChannels(allChannels.channels || []);

            return true;
          }

          // Check for failed/closed channel
          const failedChannel = channelResult.channels.find(
            (ch) => ch.state.state_name === ChannelState.Closed
          );
          if (failedChannel) {
            throw new Error('Channel was closed unexpectedly');
          }
        }

        throw new Error('Channel opening timed out. The channel may still be pending on-chain confirmation.');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';

        // Provide helpful error messages
        if (errMsg.includes('peer') || errMsg.includes('connect') || errMsg.includes('not found')) {
          setChannelError(
            `Cannot open channel: Peer not connected. The recipient node may be offline or unreachable. ` +
            `Try connecting to the peer first using their full address.`
          );
        } else if (errMsg.includes('insufficient') || errMsg.includes('balance') || errMsg.includes('fund')) {
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
    []
  );

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
    availableBalance,
    checkPaymentRoute,
    setupChannel,
  };
}

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FiberRpcClient,
  NodeInfo,
  Channel,
  PeerInfo,
  ChannelState,
  toHex,
  fromHex,
  ckbToShannon,
  formatShannon,
} from '@/lib/fiber-rpc';
import {
  FiberBrowserNode,
  PasskeyCredentialProvider,
  type BrowserNodeState,
} from '@fiber-pay/sdk/browser';
import type { StreamingPaymentClient } from '@/lib/streaming-payment';

export type ChannelStatus =
  | 'idle'
  | 'checking'
  | 'no_route'
  | 'opening_channel'
  | 'waiting_confirmation'
  | 'ready'
  | 'error';

export type NodeConnectionMode = 'local-rpc' | 'browser-passkey';

interface ReadyChannelSummary {
  state: { state_name: ChannelState };
  local_balance: string;
}

interface FiberRuntimeClient extends StreamingPaymentClient {
  nodeInfo: () => Promise<NodeInfo>;
  listChannels: (params?: { pubkey?: `0x${string}` }) => Promise<{ channels: Channel[] }>;
  listPeers: () => Promise<{ peers: PeerInfo[] }>;
  connectPeer: (params: { address: string; save?: boolean }) => Promise<unknown>;
  openChannel: (params: {
    pubkey: `0x${string}`;
    funding_amount: `0x${string}`;
    public?: boolean;
  }) => Promise<unknown>;
  findPeerIdByPubkey: (pubkey: string) => Promise<string | null>;
  findChannelToPeer: (peerPubkey: string) => Promise<ReadyChannelSummary | null>;
  checkPaymentRoute: (targetPubkey: string, amount: string) => Promise<boolean>;
}

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
  paymentClient: StreamingPaymentClient | null;
  // Browser passkey mode diagnostics
  passkeySupported: boolean | null;
  passkeyConfigured: boolean;
  browserNodeState: BrowserNodeState;
  // Channel setup
  channelStatus: ChannelStatus;
  channelError: string | null;
  channelStateName: string | null;
  channelElapsed: number;
  availableBalance: string;
  fundingAmountCkb: number;
  fundingBalanceCkb: number | null;
  isFundingSufficient: boolean;
  fundingBalanceError: string | null;
  checkPaymentRoute: (recipientPubkey: string, amount?: number) => Promise<boolean>;
  setupChannel: (fundingAmountCkb?: number) => Promise<boolean>;
  cancelChannelSetup: () => void;
}

const DEFAULT_FUNDING_AMOUNT_CKB = 1000; // 1000 CKB default funding
const CKB_RPC_URL = 'https://testnet.ckbapp.dev/';
const PASSKEY_IDENTIFIER = 'fiber-audio-browser-node';

function normalizePubkey(pubkey: string): string {
  return pubkey.trim().replace(/^0x/i, '').toLowerCase();
}

function formatRpcPubkey(pubkey: string): string {
  const normalized = normalizePubkey(pubkey);
  if (!/^[0-9a-f]{66}$/.test(normalized)) {
    throw new Error('Invalid recipient pubkey format. Expected 33-byte compressed secp256k1 pubkey hex.');
  }
  return normalized;
}

function extractPeerIdFromMultiaddr(multiaddr: string): string | null {
  const match = multiaddr.match(/\/(?:p2p|ipfs)\/([^/]+)/i);
  return match?.[1] || null;
}

function normalizeStateName(stateName?: string | null): string {
  return (stateName ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isChannelState(stateName: string | undefined, expected: ChannelState): boolean {
  return normalizeStateName(stateName) === normalizeStateName(expected);
}

interface GetCellsCapacityResult {
  capacity: `0x${string}`;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface UseFiberNodeOptions {
  recipientPubkey?: string;
  bootnodeMultiaddr?: string;
  browserBootnodeMultiaddr?: string;
  mode?: NodeConnectionMode;
  passkeyDisplayName?: string;
  browserNetwork?: 'testnet' | 'mainnet';
}

function createBrowserRuntimeClient(node: FiberBrowserNode): FiberRuntimeClient {
  const runtimeClient: FiberRuntimeClient = {
    nodeInfo: () => node.getNodeInfo(),
    listChannels: (params) => node.listChannels(params),
    listPeers: () => node.listPeers(),
    connectPeer: (params) => node.connectPeer(params),
    openChannel: (params) => node.openChannel(params),
    sendPayment: (params) => node.sendPayment(params),
    waitForPayment: (paymentHash, options) => node.waitForPayment(paymentHash, options),
    findPeerIdByPubkey: async (pubkey: string): Promise<string | null> => {
      const result = await node.listPeers();
      const targetPubkey = normalizePubkey(pubkey);
      const peer = result.peers.find((p) => normalizePubkey(p.pubkey) === targetPubkey);
      return peer?.pubkey || null;
    },
    findChannelToPeer: async (peerPubkey: string): Promise<ReadyChannelSummary | null> => {
      const result = await node.listChannels({
        pubkey: formatRpcPubkey(peerPubkey) as unknown as `0x${string}`,
      });
      const readyChannel = result.channels.find(
        (ch) => isChannelState(ch.state.state_name, ChannelState.ChannelReady) && BigInt(ch.local_balance) > 0n
      );
      return readyChannel || null;
    },
    checkPaymentRoute: async (targetPubkey: string, amount: string): Promise<boolean> => {
      const result = await node.sendPayment({
        target_pubkey: formatRpcPubkey(targetPubkey) as unknown as `0x${string}`,
        amount: amount as `0x${string}`,
        keysend: true,
        dry_run: true,
      });
      return result.status !== 'Failed';
    },
  };

  return runtimeClient;
}

export function useFiberNode(rpcUrl: string, options: UseFiberNodeOptions = {}): UseFiberNodeResult {
  const mode = options.mode ?? 'local-rpc';
  const localBootnodeMultiaddr = options.bootnodeMultiaddr?.trim() || '';
  const browserBootnodeMultiaddr = options.browserBootnodeMultiaddr?.trim() || '';
  const activeBootnodeMultiaddr =
    mode === 'browser-passkey'
      ? browserBootnodeMultiaddr || localBootnodeMultiaddr
      : localBootnodeMultiaddr;
  const activeBootnodeEnvHint =
    mode === 'browser-passkey'
      ? 'NEXT_PUBLIC_BOOTNODE_MULTIADDR_BROWSER (fallback NEXT_PUBLIC_BOOTNODE_MULTIADDR)'
      : 'NEXT_PUBLIC_BOOTNODE_MULTIADDR';
  const passkeyDisplayName = options.passkeyDisplayName?.trim() || 'Fiber Audio Listener';
  const browserNetwork = options.browserNetwork ?? 'testnet';

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paymentClient, setPaymentClient] = useState<StreamingPaymentClient | null>(null);

  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [passkeyConfigured, setPasskeyConfigured] = useState(false);
  const [browserNodeState, setBrowserNodeState] = useState<BrowserNodeState>('idle');

  const clientRef = useRef<FiberRuntimeClient | null>(null);
  const browserNodeRef = useRef<FiberBrowserNode | null>(null);

  // Channel status
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelStateName, setChannelStateName] = useState<string | null>(null);
  const [channelElapsed, setChannelElapsed] = useState(0);
  const [availableBalance, setAvailableBalance] = useState('0');
  const [fundingBalanceCkb, setFundingBalanceCkb] = useState<number | null>(null);
  const [fundingBalanceError, setFundingBalanceError] = useState<string | null>(null);
  const channelSetupCanceledRef = useRef(false);
  const channelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let disposed = false;

    const probe = async () => {
      try {
        const supported = await PasskeyCredentialProvider.isSupported();
        if (!disposed) {
          setPasskeySupported(supported);
        }
      } catch {
        if (!disposed) {
          setPasskeySupported(false);
        }
      }

      if (!disposed) {
        const provider = new PasskeyCredentialProvider(PASSKEY_IDENTIFIER);
        setPasskeyConfigured(provider.isConfigured());
      }
    };

    probe();

    return () => {
      disposed = true;
    };
  }, []);

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

  const fetchFundingBalance = useCallback(async (info: NodeInfo) => {
    try {
      const response = await fetch(CKB_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'get_cells_capacity',
          params: [
            {
              script: info.default_funding_lock_script,
              script_type: 'lock',
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`CKB RPC HTTP ${response.status}`);
      }

      const payload = (await response.json()) as JsonRpcResponse<GetCellsCapacityResult>;
      if (payload.error) {
        throw new Error(payload.error.message || 'CKB RPC error');
      }

      const capacityHex = payload.result?.capacity;
      if (!capacityHex) {
        throw new Error('No capacity returned from CKB RPC');
      }

      const capacityShannon = fromHex(capacityHex);
      const capacityCkb = Number(capacityShannon) / 100_000_000;

      if (!Number.isFinite(capacityCkb)) {
        throw new Error('Invalid funding balance from CKB RPC');
      }

      setFundingBalanceCkb(capacityCkb);
      setFundingBalanceError(null);
    } catch (err) {
      setFundingBalanceCkb(null);
      setFundingBalanceError(err instanceof Error ? err.message : 'Failed to fetch funding balance');
    }
  }, []);

  const ensureBootnodePeerConnected = useCallback(async (): Promise<string | null> => {
    const client = clientRef.current;
    if (!client || !activeBootnodeMultiaddr) {
      return null;
    }

    const targetPeerId = extractPeerIdFromMultiaddr(activeBootnodeMultiaddr);

    const peersBefore = await client.listPeers();
    if (targetPeerId) {
      const existingPeer = peersBefore.peers.find(
        (peer) => extractPeerIdFromMultiaddr(peer.address) === targetPeerId
      );
      if (existingPeer?.pubkey) {
        return existingPeer.pubkey;
      }
    }

    const peerPubkeysBefore = new Set(peersBefore.peers.map((peer) => peer.pubkey));

    try {
      await client.connectPeer({ address: activeBootnodeMultiaddr, save: true });
    } catch {
      // Some runtimes return an error if already connected; we'll verify via listPeers below.
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      const peersAfter = await client.listPeers();

      if (targetPeerId) {
        const matchedPeer = peersAfter.peers.find(
          (peer) => extractPeerIdFromMultiaddr(peer.address) === targetPeerId
        );
        if (matchedPeer?.pubkey) {
          return matchedPeer.pubkey;
        }
      }

      const newlyConnected = peersAfter.peers.find((peer) => !peerPubkeysBefore.has(peer.pubkey));

      if (newlyConnected?.pubkey) {
        return newlyConnected.pubkey;
      }

      if (peersAfter.peers.length === 1) {
        return peersAfter.peers[0].pubkey;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return null;
  }, [activeBootnodeMultiaddr]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      let client: FiberRuntimeClient;

      if (mode === 'browser-passkey') {
        if (passkeySupported === false) {
          throw new Error('Passkey PRF extension is not supported in this browser or context.');
        }

        const credential = new PasskeyCredentialProvider(PASSKEY_IDENTIFIER);

        if (!credential.isConfigured()) {
          await credential.register(passkeyDisplayName);
        }

        setPasskeyConfigured(credential.isConfigured());

        const browserNode = new FiberBrowserNode({
          network: browserNetwork,
          credential,
          nodeConfig: {
            ckbRpcUrl: CKB_RPC_URL,
            bootnodes: activeBootnodeMultiaddr ? [activeBootnodeMultiaddr] : undefined,
            databasePrefix: `fiber-audio-${PASSKEY_IDENTIFIER}`,
          },
        });

        browserNode.on('stateChange', (state) => {
          setBrowserNodeState(state);
        });
        browserNode.on('error', (err) => {
          setError(err.message);
        });

        browserNodeRef.current = browserNode;
        setBrowserNodeState(browserNode.state);

        await browserNode.start();

        client = createBrowserRuntimeClient(browserNode);
      } else {
        const localClient = new FiberRpcClient({ url: rpcUrl, timeout: 10000 });
        client = localClient as unknown as FiberRuntimeClient;
      }

      clientRef.current = client;
      setPaymentClient(client);

      const info = await client.nodeInfo();
      setNodeInfo(info);
      await fetchFundingBalance(info);

      const channelResult = await client.listChannels();
      setChannels(channelResult.channels || []);

      const peersResult = await client.listPeers();
      setPeers(peersResult.peers || []);

      if (activeBootnodeMultiaddr) {
        await ensureBootnodePeerConnected();
        const refreshedPeersResult = await client.listPeers();
        setPeers(refreshedPeersResult.peers || []);
      }

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Fiber node');
      setIsConnected(false);
      setPaymentClient(null);
      clientRef.current = null;
      if (browserNodeRef.current) {
        await browserNodeRef.current.stop().catch(() => {});
        browserNodeRef.current = null;
        setBrowserNodeState('idle');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [
    mode,
    passkeySupported,
    passkeyDisplayName,
    browserNetwork,
    activeBootnodeMultiaddr,
    rpcUrl,
    ensureBootnodePeerConnected,
    fetchFundingBalance,
  ]);

  const disconnect = useCallback(() => {
    if (browserNodeRef.current) {
      void browserNodeRef.current.stop().catch(() => {});
      browserNodeRef.current = null;
      setBrowserNodeState('idle');
    }

    clientRef.current = null;
    setPaymentClient(null);
    setIsConnected(false);
    setNodeInfo(null);
    setChannels([]);
    setPeers([]);
    setError(null);
    setChannelStatus('idle');
    setChannelError(null);
    setChannelStateName(null);
    setChannelElapsed(0);
    channelSetupCanceledRef.current = false;
    clearChannelTimer();
    setAvailableBalance('0');
    setFundingBalanceCkb(null);
    setFundingBalanceError(null);
  }, [clearChannelTimer]);

  const refresh = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const info = await clientRef.current.nodeInfo();
      setNodeInfo(info);
      await fetchFundingBalance(info);

      const channelResult = await clientRef.current.listChannels();
      setChannels(channelResult.channels || []);

      const peersResult = await clientRef.current.listPeers();
      setPeers(peersResult.peers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, [fetchFundingBalance]);

  const checkPaymentRoute = useCallback(
    async (recipientPubkey: string, amount: number = 0.01): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      if (!recipientPubkey.trim()) {
        setChannelError('Select a recipient peer or enter a recipient public key first.');
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

        const bootnodePubkey = await ensureBootnodePeerConnected();
        if (activeBootnodeMultiaddr && !bootnodePubkey) {
          setChannelStatus('no_route');
          setChannelError(
            `Cannot connect to the public bootnode. Check ${activeBootnodeEnvHint} and make sure the node is reachable.`
          );
          return false;
        }

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
        let canRoute = false;
        try {
          canRoute = await client.checkPaymentRoute(recipientPubkey, testAmount);
        } catch {
          // Dry-run failed, but we'll check if we have outbound liquidity below
          canRoute = false;
        }

        if (canRoute) {
          // Route exists via network, check our total channel balance
          const allChannels = await client.listChannels();
          const totalBalance = allChannels.channels
            .filter((ch) => isChannelState(ch.state.state_name, ChannelState.ChannelReady))
            .reduce((sum, ch) => sum + BigInt(ch.local_balance), 0n);
          setAvailableBalance(formatShannon(totalBalance));
          setChannelStatus('ready');
          return true;
        }

        // No route available to recipient
        setChannelStatus('no_route');
        setChannelError(
          'No payment route found to recipient node. Ensure the recipient is reachable from the public network and retry after channel gossip sync.'
        );
        return false;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setChannelError(errMsg);
        setChannelStatus('error');
        return false;
      }
    },
    [activeBootnodeEnvHint, activeBootnodeMultiaddr, clearChannelTimer, ensureBootnodePeerConnected]
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
    async (fundingAmountCkb: number = DEFAULT_FUNDING_AMOUNT_CKB): Promise<boolean> => {
      if (!clientRef.current) {
        setChannelError('Not connected to Fiber node');
        setChannelStatus('error');
        return false;
      }

      if (!activeBootnodeMultiaddr) {
        setChannelError(`Public node address is not configured. Set ${activeBootnodeEnvHint} first.`);
        setChannelStatus('error');
        return false;
      }

      if (fundingBalanceCkb !== null && fundingBalanceCkb < fundingAmountCkb) {
        setChannelError(
          `Insufficient funding balance (${fundingBalanceCkb.toFixed(4)} CKB). ` +
          `Need ${fundingAmountCkb} CKB. Please top up from faucet first.`
        );
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

        const bootnodePubkey = await ensureBootnodePeerConnected();
        if (!bootnodePubkey) {
          throw new Error(
            `Failed to connect to public bootnode peer. Ensure ${activeBootnodeEnvHint} is reachable and the public node is online.`
          );
        }

        const channelsBefore = await client.listChannels();
        const existingChannelIds = new Set(channelsBefore.channels.map((channel) => channel.channel_id));

        // Open channel directly to the connected public bootnode peer.
        await client.openChannel({
          pubkey: bootnodePubkey as `0x${string}`,
          funding_amount: fundingAmount as `0x${string}`,
          public: true,
        });

        // Wait for channel to become ready
        setChannelStatus('waiting_confirmation');
        startChannelTimer();

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
          const peerChannels = channelResult.channels.filter((channel) => channel.pubkey === bootnodePubkey);
          const newPeerChannels = peerChannels.filter(
            (channel) => !existingChannelIds.has(channel.channel_id)
          );

          const activeChannel =
            newPeerChannels.find((channel) => !isChannelState(channel.state.state_name, ChannelState.ChannelReady)) ||
            newPeerChannels[newPeerChannels.length - 1] ||
            peerChannels.find((channel) => !isChannelState(channel.state.state_name, ChannelState.ChannelReady)) ||
            peerChannels[peerChannels.length - 1];

          if (activeChannel?.state?.state_name) {
            setChannelStateName(activeChannel.state.state_name);
          }

          // In some runtimes (notably browser/WASM), channel id transitions may not
          // always map cleanly to the pre-open snapshot. If any channel to the
          // target peer is ready, the setup flow can proceed.
          const readyChannel =
            newPeerChannels.find((ch) => isChannelState(ch.state.state_name, ChannelState.ChannelReady)) ||
            peerChannels.find((ch) => isChannelState(ch.state.state_name, ChannelState.ChannelReady));

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
            (ch) => isChannelState(ch.state.state_name, ChannelState.Closed)
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
            `Cannot open channel: Public bootnode peer not connected. ` +
            `Check ${activeBootnodeEnvHint} and make sure the public node is reachable.`
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
    [
      activeBootnodeEnvHint,
      activeBootnodeMultiaddr,
      clearChannelTimer,
      ensureBootnodePeerConnected,
      fundingBalanceCkb,
      startChannelTimer,
    ]
  );

  const isFundingSufficient =
    fundingBalanceCkb !== null && fundingBalanceCkb >= DEFAULT_FUNDING_AMOUNT_CKB;

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
    paymentClient,
    passkeySupported,
    passkeyConfigured,
    browserNodeState,
    channelStatus,
    channelError,
    channelStateName,
    channelElapsed,
    availableBalance,
    fundingAmountCkb: DEFAULT_FUNDING_AMOUNT_CKB,
    fundingBalanceCkb,
    isFundingSufficient,
    fundingBalanceError,
    checkPaymentRoute,
    setupChannel,
    cancelChannelSetup,
  };
}

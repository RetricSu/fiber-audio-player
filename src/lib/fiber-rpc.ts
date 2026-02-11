/**
 * Fiber Network RPC client for the audio player.
 *
 * Re-exports the core SDK client from @fiber-pay/sdk/browser and extends it
 * with audio-player-specific convenience methods (keysend, peer lookup,
 * channel helpers, route checking).
 */

import {
  FiberRpcClient as BaseFiberRpcClient,
  FiberRpcError,
  toHex,
  fromHex,
  ckbToShannons,
  shannonsToCkb,
} from '@fiber-pay/sdk/browser';

import type {
  HexString,
  ChannelInfo,
  PeerInfo as SdkPeerInfo,
  SendPaymentParams as SdkSendPaymentParams,
  NewInvoiceParams,
  ParseInvoiceParams,
  OpenChannelParams as SdkOpenChannelParams,
  OpenChannelResult,
  PaymentStatus,
  ChannelState,
  ListChannelsParams,
} from '@fiber-pay/sdk/browser';

// ─── Re-export SDK types under audio-player-friendly aliases ─────────────────

export { FiberRpcError, toHex, fromHex };

export type { HexString, ChannelState, PaymentStatus };

/** Channel shape used throughout the audio player UI */
export type Channel = ChannelInfo;

/** Node info returned by `node_info` RPC */
export interface NodeInfo {
  version: string;
  commit_hash: string;
  public_key: string;
  peer_id?: string;
  node_name: string | null;
  addresses: string[];
  chain_hash: string;
  open_channel_count: number;
  channel_count?: number;
  pending_channel_count: number;
  peers_count: number;
  udt_cfg_infos: unknown[];
}

/** Peer shape the audio player expects (peer_id + address + optional pubkey from graph) */
export interface PeerInfo {
  peer_id: string;
  address: string;
  /** Hex pubkey (node_id from graph_nodes). Only available if the peer has announced to the graph. */
  pubkey: string | null;
}

/** Invoice data shape */
export interface Invoice {
  currency: string;
  amount: string;
  signature: object | null;
  data: {
    timestamp: string;
    payment_hash: string;
    attrs: unknown[];
  };
}

export interface InvoiceParams {
  amount: string;
  currency: 'Fibb' | 'Fibt' | 'Fibd';
  description?: string;
  payment_preimage?: string;
  expiry?: string;
  final_expiry_delta?: string;
  udt_type_script?: { code_hash: string; hash_type: string; args: string };
  hash_algorithm?: 'CkbHash' | 'Sha256';
}

export interface SendPaymentParams {
  target_pubkey?: string;
  amount?: string;
  payment_hash?: string;
  invoice?: string;
  keysend?: boolean;
  final_tlc_expiry_delta?: string;
  timeout?: string;
  max_fee_amount?: string;
  max_fee_rate?: string;
  custom_records?: Record<string, string>;
  dry_run?: boolean;
}

export interface PaymentResult {
  payment_hash: string;
  status: PaymentStatus;
  created_at: string;
  last_updated_at: string;
  failed_error: string | null;
  fee: string;
  custom_records: Record<string, string> | null;
}

export interface OpenChannelParams {
  peer_id: string;
  funding_amount: string;
  public?: boolean;
  funding_udt_type_script?: { code_hash: string; hash_type: string; args: string };
  shutdown_script?: { code_hash: string; hash_type: string; args: string };
  commitment_delay_epoch?: string;
  commitment_fee_rate?: string;
  funding_fee_rate?: string;
  tlc_expiry_delta?: string;
  tlc_min_value?: string;
  tlc_fee_proportional_millionths?: string;
  max_tlc_value_in_flight?: string;
  max_tlc_number_in_flight?: string;
}

export interface FiberRpcConfig {
  url: string;
  timeout?: number;
}

// ─── Extended RPC Client ─────────────────────────────────────────────────────

/**
 * Audio-player Fiber RPC client.
 *
 * Wraps `@fiber-pay/sdk`'s `FiberRpcClient` and adds convenience helpers that
 * the streaming-payment service and React hooks rely on.
 */
export class FiberRpcClient {
  private sdk: BaseFiberRpcClient;

  constructor(config: FiberRpcConfig) {
    this.sdk = new BaseFiberRpcClient({
      url: config.url,
      timeout: config.timeout,
    });
  }

  /** Expose the underlying SDK client for advanced usage */
  get raw(): BaseFiberRpcClient {
    return this.sdk;
  }

  // ── Node ─────────────────────────────────────────────────────────────────

  async getNodeInfo(): Promise<NodeInfo> {
    const result = await this.sdk.nodeInfo();
    return result as unknown as NodeInfo;
  }

  // ── Channels ─────────────────────────────────────────────────────────────

  async listChannels(options?: { peer_id?: string; include_closed?: boolean }): Promise<{ channels: Channel[] }> {
    const result = await this.sdk.listChannels(options as ListChannelsParams);
    return result as { channels: Channel[] };
  }

  async openChannel(params: OpenChannelParams): Promise<OpenChannelResult> {
    return this.sdk.openChannel(params as unknown as SdkOpenChannelParams);
  }

  async getChannel(channelId: string): Promise<Channel> {
    const result = await this.sdk.listChannels({ channel_id: channelId } as ListChannelsParams);
    return (result as { channels: Channel[] }).channels[0];
  }

  // ── Peers ────────────────────────────────────────────────────────────────

  async connectPeer(address: string): Promise<void> {
    await this.sdk.connectPeer({ address });
  }

  async disconnectPeer(peerId: string): Promise<void> {
    await this.sdk.disconnectPeer({ peer_id: peerId });
  }

  async listPeers(): Promise<{ peers: PeerInfo[] }> {
    const result = await this.sdk.listPeers();
    const sdkPeers = (result as { peers: SdkPeerInfo[] }).peers ?? [];

    // Build a peer_id → pubkey mapping from graph_nodes.
    // graph_nodes returns { node_id (hex pubkey), addresses (multiaddr containing /p2p/<peer_id>) }.
    // We extract peer_id from the multiaddr and map it to node_id.
    let peerIdToPubkey: Map<string, string> = new Map();
    try {
      const graphResult = await this.sdk.graphNodes();
      const nodes = (graphResult as { nodes: Array<{ node_id: string; addresses: string[] }> }).nodes ?? [];
      for (const node of nodes) {
        for (const addr of node.addresses) {
          // Multiaddr format: /ip4/x.x.x.x/tcp/port/p2p/<peer_id>
          const p2pMatch = addr.match(/\/p2p\/([^/]+)$/);
          if (p2pMatch) {
            peerIdToPubkey.set(p2pMatch[1], node.node_id);
          }
        }
      }
    } catch {
      // graph_nodes may not be available or may be empty — non-fatal
    }

    const peers: PeerInfo[] = sdkPeers.map((p) => ({
      peer_id: p.peer_id,
      address: p.addresses?.[0] ?? '',
      pubkey: peerIdToPubkey.get(p.peer_id) ?? null,
    }));
    return { peers };
  }

  // ── Convenience: Peer helpers ────────────────────────────────────────────

  async findChannelToPeer(peerId: string): Promise<Channel | null> {
    const result = await this.listChannels({ peer_id: peerId });
    const readyChannel = result.channels.find(
      (ch) => ch.state.state_name === 'ChannelReady' && BigInt(ch.local_balance) > 0n
    );
    return readyChannel ?? null;
  }

  async checkPaymentRoute(targetPubkey: string, amount: string): Promise<boolean> {
    try {
      const result = await this.sendPayment({
        target_pubkey: targetPubkey,
        amount,
        keysend: true,
        dry_run: true,
      });
      return result.status !== 'Failed';
    } catch {
      return false;
    }
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async newInvoice(params: InvoiceParams): Promise<{ invoice_address: string; invoice: Invoice }> {
    const result = await this.sdk.newInvoice(params as unknown as NewInvoiceParams);
    return result as unknown as { invoice_address: string; invoice: Invoice };
  }

  async parseInvoice(invoice: string): Promise<Invoice> {
    const result = await this.sdk.parseInvoice({ invoice } as ParseInvoiceParams);
    return result as unknown as Invoice;
  }

  async getInvoice(paymentHash: string): Promise<Invoice> {
    const result = await this.sdk.getInvoice({ payment_hash: paymentHash as HexString });
    return result as unknown as Invoice;
  }

  async cancelInvoice(paymentHash: string): Promise<void> {
    await this.sdk.cancelInvoice({ payment_hash: paymentHash as HexString });
  }

  async settleInvoice(paymentHash: string, paymentPreimage: string): Promise<void> {
    await this.sdk.settleInvoice({ payment_hash: paymentHash as HexString, payment_preimage: paymentPreimage as HexString });
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    const result = await this.sdk.sendPayment(params as unknown as SdkSendPaymentParams);
    return result as unknown as PaymentResult;
  }

  async getPayment(paymentHash: string): Promise<PaymentResult> {
    const result = await this.sdk.getPayment({ payment_hash: paymentHash as HexString });
    return result as unknown as PaymentResult;
  }

  /** Spontaneous keysend payment (no invoice needed) */
  async keysend(
    targetPubkey: string,
    amount: string,
    customRecords?: Record<string, string>
  ): Promise<PaymentResult> {
    return this.sendPayment({
      target_pubkey: targetPubkey,
      amount,
      keysend: true,
      custom_records: customRecords,
    });
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

/** 1 CKB = 10^8 shannon */
export const SHANNON_PER_CKB = 100_000_000n;

/** Convert CKB to shannon as bigint */
export function ckbToShannon(ckb: number): bigint {
  return BigInt(Math.floor(ckb * 100_000_000));
}

/** Convert shannon bigint to CKB number */
export function shannonToCkb(shannon: bigint): number {
  return Number(shannon) / 100_000_000;
}

/** Format a shannon amount for display */
export function formatShannon(shannon: bigint | string, decimals = 4): string {
  const value = typeof shannon === 'string' ? BigInt(shannon) : shannon;
  const ckb = shannonToCkb(value);
  return ckb.toFixed(decimals);
}

// Fiber Network RPC - Migrated to use @fiber-pay/sdk (Browser version)
// Re-exports SDK types and utilities for backward compatibility

import {
  FiberRpcClient as SdkFiberRpcClient,
  toHex as sdkToHex,
  fromHex as sdkFromHex,
  ckbToShannons,
  shannonsToCkb,
} from '@fiber-pay/sdk/browser';

// Define ChannelState enum locally (matching SDK values)
export enum ChannelState {
  NegotiatingFunding = 'NEGOTIATING_FUNDING',
  CollaboratingFundingTx = 'COLLABORATING_FUNDING_TX',
  SigningCommitment = 'SIGNING_COMMITMENT',
  AwaitingTxSignatures = 'AWAITING_TX_SIGNATURES',
  AwaitingChannelReady = 'AWAITING_CHANNEL_READY',
  ChannelReady = 'CHANNEL_READY',
  ShuttingDown = 'SHUTTING_DOWN',
  Closed = 'CLOSED',
}

// Re-export utility functions with backward-compatible names
export const toHex = sdkToHex;
export const fromHex = sdkFromHex;

// Shannon conversion (1 CKB = 10^8 shannon)
export const SHANNON_PER_CKB = 100_000_000n;

export function ckbToShannon(ckb: number): bigint {
  return BigInt(ckbToShannons(ckb));
}

export function shannonToCkb(shannon: bigint): number {
  return shannonsToCkb(toHex(shannon));
}

// Format shannon amount for display
export function formatShannon(shannon: bigint | string, decimals = 4): string {
  const value = typeof shannon === 'string' ? fromHex(shannon as `0x${string}`) : shannon;
  const ckb = shannonToCkb(value);
  return ckb.toFixed(decimals);
}

// Extend the SDK client with additional helper methods for backward compatibility
export class FiberRpcClient extends SdkFiberRpcClient {
  constructor(config: { url: string; timeout?: number }) {
    super(config);
  }

  private normalizePubkey(pubkey: string): string {
    return pubkey.trim().replace(/^0x/i, '').toLowerCase();
  }

  private formatRpcPubkey(pubkey: string): string {
    const normalized = this.normalizePubkey(pubkey);
    if (!/^[0-9a-f]{66}$/.test(normalized)) {
      throw new Error('Invalid recipient pubkey format. Expected 33-byte compressed secp256k1 pubkey hex.');
    }
    return normalized;
  }

  // Find peer_id (Qm... format) by pubkey
  async findPeerIdByPubkey(pubkey: string): Promise<string | null> {
    const result = await this.listPeers();
    const targetPubkey = this.normalizePubkey(pubkey);
    const peer = result.peers.find((p) => this.normalizePubkey(p.pubkey) === targetPubkey);
    return peer?.peer_id || null;
  }

  // Open channel by pubkey (looks up peer_id first)
  async openChannelByPubkey(
    pubkey: string,
    fundingAmount: string,
    options?: { public?: boolean }
  ): Promise<{ temporary_channel_id: string }> {
    const peerId = await this.findPeerIdByPubkey(pubkey);
    if (!peerId) {
      throw new Error(
        `Peer not connected. The recipient node (${pubkey.slice(0, 10)}...) is not in your peer list. ` +
        `They need to be connected first.`
      );
    }
    return this.openChannel({
      peer_id: peerId,
      funding_amount: fundingAmount as `0x${string}`,
      public: options?.public,
    });
  }

  // Check if we have a usable channel to a peer
  async findChannelToPeer(peerId: string): Promise<{ state: { state_name: ChannelState }; local_balance: string } | null> {
    const result = await this.listChannels({ peer_id: peerId });
    const readyChannel = result.channels.find(
      (ch) => ch.state.state_name === ChannelState.ChannelReady && BigInt(ch.local_balance) > 0n
    );
    return readyChannel || null;
  }

  // Check if payment route exists to target (uses dry_run)
  async checkPaymentRoute(targetPubkey: string, amount: string): Promise<boolean> {
    const result = await this.sendPayment({
      target_pubkey: this.formatRpcPubkey(targetPubkey) as unknown as `0x${string}`,
      amount: amount as `0x${string}`,
      keysend: true,
      dry_run: true,
    });
    return result.status !== 'Failed';
  }

  // Keysend payment (spontaneous payment without invoice)
  async keysend(targetPubkey: string, amount: string, customRecords?: Record<string, string>): Promise<{ payment_hash: string; status: string; failed_error?: string }> {
    return this.sendPayment({
      target_pubkey: this.formatRpcPubkey(targetPubkey) as unknown as `0x${string}`,
      amount: amount as `0x${string}`,
      keysend: true,
      custom_records: customRecords as Record<`0x${string}`, `0x${string}`> | undefined,
    });
  }
}

// Re-export types from SDK for convenience
export type { 
  NodeInfo, 
  Channel, 
  PeerInfo, 
  SendPaymentParams,
  NewInvoiceParams,
} from '@fiber-pay/sdk/browser';

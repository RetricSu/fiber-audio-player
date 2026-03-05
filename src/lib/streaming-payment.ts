// Streaming payment service for audio playback
// Invoice-based pay-per-chunk model using Fiber Network hold invoices

import { FiberRpcClient, toHex, fromHex, formatShannon, ckbToShannon } from './fiber-rpc';
import {
  createSession,
  createInvoice,
  claimInvoice,
  toAbsolutePlaylistUrl,
  type ClaimInvoiceResponse,
} from './stream-auth';

export interface StreamingPaymentConfig {
  rpcUrl: string;
  recipientPubkey: string;
  ratePerSecond: number; // in CKB (display only — actual pricing comes from backend)
}

export interface PaymentTick {
  timestamp: number;
  amountShannon: bigint;
  totalPaidShannon: bigint;
  paymentHash?: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

export type PaymentCallback = (tick: PaymentTick) => void;

export interface StreamGrant {
  token: string;
  playlistUrl: string;
  grantedSeconds: number;
  maxSegmentIndex: number;
  expiresAt: number;
}

export type StreamGrantCallback = (grant: StreamGrant) => void;

export class StreamingPaymentService {
  private client: FiberRpcClient;
  private config: StreamingPaymentConfig;
  private isStreaming = false;
  private totalPaid = 0n;
  private callbacks: Set<PaymentCallback> = new Set();
  private grantCallbacks: Set<StreamGrantCallback> = new Set();

  // Session state
  private sessionId: string | null = null;
  private currentGrant: StreamGrant | null = null;

  constructor(config: StreamingPaymentConfig) {
    this.config = config;
    this.client = new FiberRpcClient({ url: config.rpcUrl });
  }

  onPayment(callback: PaymentCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  onGrantUpdate(callback: StreamGrantCallback): () => void {
    this.grantCallbacks.add(callback);
    return () => this.grantCallbacks.delete(callback);
  }

  private notifyPayment(tick: PaymentTick) {
    this.callbacks.forEach((cb) => cb(tick));
  }

  private notifyGrant(grant: StreamGrant) {
    this.grantCallbacks.forEach((cb) => cb(grant));
  }

  /**
   * Start a streaming session. Creates a backend session, then performs the
   * first invoice-pay-claim cycle to unlock the initial batch of segments.
   *
   * @param seconds  Number of seconds to purchase in the first batch
   * @returns The initial stream grant (playlist URL, token, etc.)
   */
  async startStreaming(seconds: number = 30): Promise<StreamGrant> {
    if (this.isStreaming && this.currentGrant) {
      return this.currentGrant;
    }

    if (!this.config.recipientPubkey?.trim()) {
      throw new Error('Recipient public key is required to start streaming payments.');
    }

    // 1. Create a backend session
    const sessionRes = await createSession();
    this.sessionId = sessionRes.session.sessionId;

    this.isStreaming = true;

    // 2. Pay for the first batch
    const grant = await this.payForSeconds(seconds);
    return grant;
  }

  /**
   * Pay for additional seconds of streaming. Creates a hold invoice on the
   * backend, pays it via the user's Fiber node, then claims the stream grant.
   */
  async payForSeconds(seconds: number): Promise<StreamGrant> {
    if (!this.sessionId) {
      throw new Error('No active session. Call startStreaming() first.');
    }

    // 1. Request hold invoice from backend
    const invoiceRes = await createInvoice({
      sessionId: this.sessionId,
      seconds,
    });

    const { invoiceAddress, paymentHash, amountShannon: amountHex } = invoiceRes.invoice;
    const amountShannon = fromHex(amountHex as `0x${string}`);

    const tick: PaymentTick = {
      timestamp: Date.now(),
      amountShannon,
      totalPaidShannon: this.totalPaid,
      paymentHash,
      status: 'pending',
    };
    this.notifyPayment(tick);

    try {
      // 2. Send payment via user's Fiber node
      // sendPayment will return quickly; actual settlement happens when backend settles the invoice
      const payResult = await this.client.sendPayment({
        invoice: invoiceAddress as `0x${string}`,
      });

      // Do not wait for the payment to fully resolve here — the backend's
      // /invoices/claim will wait for "Received" and then settle, which will
      // cause this payment to complete on-chain. We call claim in parallel.

      // 3. Claim the grant from backend (backend waits for Received → settles)
      let claimRes: ClaimInvoiceResponse;
      try {
        claimRes = await claimInvoice({ paymentHash });
      } catch (claimErr) {
        // If claim fails, the payment might still be in-flight. We don't
        // try to cancel — the invoice will expire server-side.
        throw new Error(
          `Invoice claim failed: ${claimErr instanceof Error ? claimErr.message : 'Unknown error'}`
        );
      }

      const grant: StreamGrant = {
        token: claimRes.stream.token,
        playlistUrl: toAbsolutePlaylistUrl(claimRes.stream.playlistUrl),
        grantedSeconds: claimRes.stream.grantedSeconds,
        maxSegmentIndex: claimRes.stream.maxSegmentIndex,
        expiresAt: claimRes.stream.expiresAt,
      };

      this.currentGrant = grant;
      this.totalPaid += amountShannon;

      tick.status = 'success';
      tick.totalPaidShannon = this.totalPaid;
      this.notifyPayment(tick);
      this.notifyGrant(grant);

      return grant;
    } catch (error) {
      tick.status = 'failed';
      tick.error = error instanceof Error ? error.message : 'Unknown error';
      tick.totalPaidShannon = this.totalPaid;
      this.notifyPayment(tick);
      throw error;
    }
  }

  async stopStreaming(): Promise<void> {
    this.isStreaming = false;
    // Session stays valid so user can resume without re-paying
  }

  getCurrentGrant(): StreamGrant | null {
    return this.currentGrant;
  }

  getTotalPaid(): bigint {
    return this.totalPaid;
  }

  getTotalPaidFormatted(): string {
    return formatShannon(this.totalPaid);
  }

  isActive(): boolean {
    return this.isStreaming;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

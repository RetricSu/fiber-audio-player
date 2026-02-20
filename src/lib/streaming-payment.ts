// Streaming payment service for audio playback
// Implements pay-per-second model using Fiber Network

import { FiberRpcClient, toHex, formatShannon, ckbToShannon } from './fiber-rpc';

const MIN_ROUTE_CHECK_CKB = 0.0001;
const MIN_PAYMENT_SHANNON = 1n;

export interface StreamingPaymentConfig {
  rpcUrl: string;
  recipientPubkey: string;
  ratePerSecond: number; // in CKB
  paymentIntervalMs?: number; // how often to send payments
  currency?: 'Fibb' | 'Fibt' | 'Fibd';
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

export class StreamingPaymentService {
  private client: FiberRpcClient;
  private config: Required<StreamingPaymentConfig>;
  private isStreaming = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private totalPaid = 0n;
  private callbacks: Set<PaymentCallback> = new Set();
  private lastPaymentTime = 0;
  private accumulatedSeconds = 0;
  private pendingAmountShannon = 0n;

  constructor(config: StreamingPaymentConfig) {
    this.config = {
      ...config,
      paymentIntervalMs: config.paymentIntervalMs || 1000, // Default: pay every 1 second
      currency: config.currency || 'Fibd',
    };
    this.client = new FiberRpcClient({ url: config.rpcUrl });
  }

  onPayment(callback: PaymentCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifyCallbacks(tick: PaymentTick) {
    this.callbacks.forEach((cb) => cb(tick));
  }

  async startStreaming(): Promise<void> {
    if (this.isStreaming) return;

    // Check if we have a valid payment route before starting
    const routeProbeAmount = Math.max(this.config.ratePerSecond, MIN_ROUTE_CHECK_CKB);
    const canPay = await this.checkPaymentRoute(routeProbeAmount);
    if (!canPay) {
      throw new Error(
        'No payment route available to recipient. Please ensure you have an open channel ' +
        'with sufficient balance, either directly or through the Fiber network.'
      );
    }

    this.isStreaming = true;
    this.lastPaymentTime = Date.now();
    this.accumulatedSeconds = 0;
    this.pendingAmountShannon = 0n;

    this.intervalId = setInterval(() => {
      this.processPaymentTick();
    }, this.config.paymentIntervalMs);
  }

  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) return;
    this.isStreaming = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Process final payment for remaining time
    await this.processPaymentTick();
    this.accumulatedSeconds = 0;
  }

  private async processPaymentTick(): Promise<void> {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastPaymentTime) / 1000;
    this.lastPaymentTime = now;
    this.accumulatedSeconds += elapsedSeconds;

    // Only pay for full seconds accumulated
    const secondsToPay = Math.floor(this.accumulatedSeconds);
    if (secondsToPay <= 0) return;

    this.accumulatedSeconds -= secondsToPay;
    const accruedAmountShannon = ckbToShannon(this.config.ratePerSecond * secondsToPay);
    this.pendingAmountShannon += accruedAmountShannon;

    // Keep accumulating until we have at least 1 shannon to send.
    if (this.pendingAmountShannon < MIN_PAYMENT_SHANNON) {
      return;
    }

    const amountShannon = this.pendingAmountShannon;

    const tick: PaymentTick = {
      timestamp: now,
      amountShannon,
      totalPaidShannon: this.totalPaid + amountShannon,
      status: 'pending',
    };

    try {
      const result = await this.client.keysend(
        this.config.recipientPubkey,
        toHex(amountShannon)
      );

      tick.paymentHash = result.payment_hash;
      tick.status = result.status === 'Success' ? 'success' : 'failed';
      if (result.failed_error) {
        tick.error = result.failed_error;
      }

      if (tick.status === 'success') {
        this.totalPaid += amountShannon;
        this.pendingAmountShannon = 0n;
        tick.totalPaidShannon = this.totalPaid;
      }
    } catch (error) {
      tick.status = 'failed';
      tick.error = error instanceof Error ? error.message : 'Unknown error';
    }

    this.notifyCallbacks(tick);
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

  // Dry run to check if payment would succeed
  async checkPaymentRoute(amount: number): Promise<boolean> {
    return this.client.checkPaymentRoute(this.config.recipientPubkey, toHex(ckbToShannon(amount)));
  }
}

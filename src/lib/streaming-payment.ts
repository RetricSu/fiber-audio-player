// Streaming payment service for audio playback
// Implements pay-per-second model using Fiber Network

import { FiberRpcClient, toHex, formatShannon, ckbToShannon } from './fiber-rpc';

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

  constructor(config: StreamingPaymentConfig) {
    this.config = {
      ...config,
      paymentIntervalMs: config.paymentIntervalMs || 5000, // Default: pay every 5 seconds
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
    this.isStreaming = true;
    this.lastPaymentTime = Date.now();
    this.accumulatedSeconds = 0;

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
    const amountShannon = ckbToShannon(this.config.ratePerSecond * secondsToPay);

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
    try {
      const result = await this.client.sendPayment({
        target_pubkey: this.config.recipientPubkey,
        amount: toHex(ckbToShannon(amount)),
        keysend: true,
        dry_run: true,
      });
      return result.status !== 'Failed';
    } catch {
      return false;
    }
  }
}

// Create a mock service for demo/development when no Fiber node is available
export class MockStreamingPaymentService extends StreamingPaymentService {
  private mockTotalPaid = 0n;
  private mockIsStreaming = false;
  private mockIntervalId: ReturnType<typeof setInterval> | null = null;
  private mockCallbacks: Set<PaymentCallback> = new Set();
  private mockConfig: Required<StreamingPaymentConfig>;
  private mockLastTime = 0;
  private mockAccumulated = 0;

  constructor(config: StreamingPaymentConfig) {
    super(config);
    this.mockConfig = {
      ...config,
      paymentIntervalMs: config.paymentIntervalMs || 5000,
      currency: config.currency || 'Fibd',
    };
  }

  override onPayment(callback: PaymentCallback): () => void {
    this.mockCallbacks.add(callback);
    return () => this.mockCallbacks.delete(callback);
  }

  override async startStreaming(): Promise<void> {
    if (this.mockIsStreaming) return;
    this.mockIsStreaming = true;
    this.mockLastTime = Date.now();
    this.mockAccumulated = 0;

    this.mockIntervalId = setInterval(() => {
      this.mockProcessTick();
    }, this.mockConfig.paymentIntervalMs);
  }

  override async stopStreaming(): Promise<void> {
    if (!this.mockIsStreaming) return;
    this.mockIsStreaming = false;

    if (this.mockIntervalId) {
      clearInterval(this.mockIntervalId);
      this.mockIntervalId = null;
    }
  }

  private mockProcessTick(): void {
    const now = Date.now();
    const elapsed = (now - this.mockLastTime) / 1000;
    this.mockLastTime = now;
    this.mockAccumulated += elapsed;

    const secondsToPay = Math.floor(this.mockAccumulated);
    if (secondsToPay <= 0) return;

    this.mockAccumulated -= secondsToPay;
    const amount = ckbToShannon(this.mockConfig.ratePerSecond * secondsToPay);
    this.mockTotalPaid += amount;

    const tick: PaymentTick = {
      timestamp: now,
      amountShannon: amount,
      totalPaidShannon: this.mockTotalPaid,
      paymentHash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'),
      status: 'success',
    };

    this.mockCallbacks.forEach((cb) => cb(tick));
  }

  override getTotalPaid(): bigint {
    return this.mockTotalPaid;
  }

  override getTotalPaidFormatted(): string {
    return formatShannon(this.mockTotalPaid);
  }

  override isActive(): boolean {
    return this.mockIsStreaming;
  }

  override async checkPaymentRoute(): Promise<boolean> {
    return true;
  }
}

// Fiber Network RPC Types based on fiber-lib spec

export interface FiberRpcConfig {
  url: string;
  timeout?: number;
}

export interface Script {
  code_hash: string;
  hash_type: 'data' | 'data1' | 'data2' | 'type';
  args: string;
}

export interface InvoiceParams {
  amount: string; // hex u128
  currency: 'Fibb' | 'Fibt' | 'Fibd';
  description?: string;
  payment_preimage?: string;
  expiry?: string; // hex u64
  final_expiry_delta?: string;
  udt_type_script?: Script;
  hash_algorithm?: 'CkbHash' | 'Sha256';
}

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

export interface NewInvoiceResult {
  invoice_address: string;
  invoice: Invoice;
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

export type PaymentStatus = 'Created' | 'Inflight' | 'Success' | 'Failed';

export interface PaymentResult {
  payment_hash: string;
  status: PaymentStatus;
  created_at: string;
  last_updated_at: string;
  failed_error: string | null;
  fee: string;
  custom_records: Record<string, string> | null;
}

export interface Channel {
  channel_id: string;
  peer_id: string;
  state: {
    state_name: string;
    state_flags: string[];
  };
  local_balance: string;
  remote_balance: string;
  offered_tlc_balance: string;
  received_tlc_balance: string;
  created_at: string;
}

export interface NodeInfo {
  version: string;
  commit_hash: string;
  public_key: string;
  node_name: string | null;
  addresses: string[];
  chain_hash: string;
  open_channel_count: number;
  pending_channel_count: number;
  peers_count: number;
  udt_cfg_infos: object[];
}

export interface RpcResponse<T> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let rpcId = 0;

export class FiberRpcClient {
  private url: string;
  private timeout: number;

  constructor(config: FiberRpcConfig) {
    this.url = config.url;
    this.timeout = config.timeout || 30000;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const id = ++rpcId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RpcResponse<T> = await response.json();

      if (data.error) {
        throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
      }

      return data.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Node Info
  async getNodeInfo(): Promise<NodeInfo> {
    return this.call<NodeInfo>('node_info', [{}]);
  }

  // Channel Operations
  async listChannels(options?: { peer_id?: string; include_closed?: boolean }): Promise<{ channels: Channel[] }> {
    return this.call('list_channels', [options || {}]);
  }

  // Invoice Operations
  async newInvoice(params: InvoiceParams): Promise<NewInvoiceResult> {
    return this.call<NewInvoiceResult>('new_invoice', [params]);
  }

  async parseInvoice(invoice: string): Promise<Invoice> {
    return this.call<Invoice>('parse_invoice', [{ invoice }]);
  }

  async getInvoice(paymentHash: string): Promise<Invoice> {
    return this.call<Invoice>('get_invoice', [{ payment_hash: paymentHash }]);
  }

  async cancelInvoice(paymentHash: string): Promise<void> {
    return this.call<void>('cancel_invoice', [{ payment_hash: paymentHash }]);
  }

  async settleInvoice(paymentHash: string, paymentPreimage: string): Promise<void> {
    return this.call<void>('settle_invoice', [{
      payment_hash: paymentHash,
      payment_preimage: paymentPreimage
    }]);
  }

  // Payment Operations
  async sendPayment(params: SendPaymentParams): Promise<PaymentResult> {
    return this.call<PaymentResult>('send_payment', [params]);
  }

  async getPayment(paymentHash: string): Promise<PaymentResult> {
    return this.call<PaymentResult>('get_payment', [{ payment_hash: paymentHash }]);
  }

  // Keysend payment (spontaneous payment without invoice)
  async keysend(targetPubkey: string, amount: string, customRecords?: Record<string, string>): Promise<PaymentResult> {
    return this.sendPayment({
      target_pubkey: targetPubkey,
      amount,
      keysend: true,
      custom_records: customRecords,
    });
  }
}

// Helper functions for hex conversion
export function toHex(value: number | bigint): string {
  return '0x' + value.toString(16);
}

export function fromHex(hex: string): bigint {
  return BigInt(hex);
}

// Shannon conversion (1 CKB = 10^8 shannon)
export const SHANNON_PER_CKB = 100_000_000n;

export function ckbToShannon(ckb: number): bigint {
  return BigInt(Math.floor(ckb * 100_000_000));
}

export function shannonToCkb(shannon: bigint): number {
  return Number(shannon) / 100_000_000;
}

// Format shannon amount for display
export function formatShannon(shannon: bigint | string, decimals = 4): string {
  const value = typeof shannon === 'string' ? fromHex(shannon) : shannon;
  const ckb = shannonToCkb(value);
  return ckb.toFixed(decimals);
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StreamingPaymentService,
  StreamingPaymentConfig,
  PaymentTick,
  StreamGrant,
} from '@/lib/streaming-payment';
import { formatShannon } from '@/lib/fiber-rpc';

export interface UseStreamingPaymentResult {
  isStreaming: boolean;
  totalPaid: string;
  lastPayment: PaymentTick | null;
  paymentHistory: PaymentTick[];
  error: string | null;
  currentGrant: StreamGrant | null;
  /** Start streaming – creates session, pays first invoice, returns grant */
  start: (episodeId?: string, seconds?: number) => Promise<StreamGrant | null>;
  /** Pay for more seconds within the active session */
  extend: (seconds?: number) => Promise<StreamGrant | null>;
  stop: () => Promise<void>;
}

export function useStreamingPayment(
  config: StreamingPaymentConfig
): UseStreamingPaymentResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [totalPaid, setTotalPaid] = useState('0.0000');
  const [lastPayment, setLastPayment] = useState<PaymentTick | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentTick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentGrant, setCurrentGrant] = useState<StreamGrant | null>(null);
  const serviceRef = useRef<StreamingPaymentService | null>(null);

  useEffect(() => {
    const service = new StreamingPaymentService(config);
    serviceRef.current = service;

    const unsubPayment = service.onPayment((tick) => {
      setLastPayment(tick);
      setTotalPaid(formatShannon(tick.totalPaidShannon));
      setPaymentHistory((prev) => {
        // One row per invoice/payment hash: update status in place (pending -> success/failed).
        if (tick.paymentHash) {
          const index = prev.findIndex((p) => p.paymentHash === tick.paymentHash);
          if (index >= 0) {
            const next = [...prev];
            next[index] = tick;
            return next.slice(-50);
          }
        }
        return [...prev.slice(-50), tick];
      });

      if (tick.status === 'failed' && tick.error) {
        setError(tick.error);
      }
    });

    const unsubGrant = service.onGrantUpdate((grant) => {
      setCurrentGrant(grant);
    });

    return () => {
      unsubPayment();
      unsubGrant();
      service.stopStreaming();
    };
  }, [
    config.rpcUrl,
    config.recipientPubkey,
    config.ratePerSecond,
    config.paymentClient,
  ]);

  const start = useCallback(async (episodeId?: string, seconds: number = 30): Promise<StreamGrant | null> => {
    if (!serviceRef.current) return null;
    setError(null);
    try {
      const grant = await serviceRef.current.startStreaming(episodeId, seconds);
      setIsStreaming(true);
      setCurrentGrant(grant);
      return grant;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment stream');
      setIsStreaming(false);
      return null;
    }
  }, []);

  const extend = useCallback(async (seconds: number = 30): Promise<StreamGrant | null> => {
    if (!serviceRef.current) return null;
    setError(null);
    try {
      const grant = await serviceRef.current.payForSeconds(seconds);
      setCurrentGrant(grant);
      return grant;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend stream');
      return null;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!serviceRef.current) return;
    try {
      await serviceRef.current.stopStreaming();
      setIsStreaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop payment stream');
    }
  }, []);

  return {
    isStreaming,
    totalPaid,
    lastPayment,
    paymentHistory,
    error,
    currentGrant,
    start,
    extend,
    stop,
  };
}

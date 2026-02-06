'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StreamingPaymentService,
  StreamingPaymentConfig,
  PaymentTick,
} from '@/lib/streaming-payment';
import { formatShannon } from '@/lib/fiber-rpc';

export interface UseStreamingPaymentResult {
  isStreaming: boolean;
  totalPaid: string;
  lastPayment: PaymentTick | null;
  paymentHistory: PaymentTick[];
  error: string | null;
  start: () => Promise<void>;
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
  const serviceRef = useRef<StreamingPaymentService | null>(null);

  useEffect(() => {
    const service = new StreamingPaymentService(config);
    serviceRef.current = service;

    const unsubscribe = service.onPayment((tick) => {
      setLastPayment(tick);
      setTotalPaid(formatShannon(tick.totalPaidShannon));
      setPaymentHistory((prev) => [...prev.slice(-50), tick]);

      if (tick.status === 'failed' && tick.error) {
        setError(tick.error);
      }
    });

    return () => {
      unsubscribe();
      service.stopStreaming();
    };
  }, [config.rpcUrl, config.recipientPubkey, config.ratePerSecond]);

  const start = useCallback(async () => {
    if (!serviceRef.current) return;
    setError(null);
    try {
      await serviceRef.current.startStreaming();
      setIsStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start payment stream');
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
    start,
    stop,
  };
}

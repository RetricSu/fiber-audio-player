'use client';

import { motion, AnimatePresence } from 'motion/react';
import { PaymentTick } from '@/lib/streaming-payment';
import { formatShannon } from '@/lib/fiber-rpc';

interface PaymentHistoryProps {
  payments: PaymentTick[];
}

export function PaymentHistory({ payments }: PaymentHistoryProps) {
  const recentPayments = payments.slice(-10).reverse();

  return (
    <div className="relative overflow-hidden rounded-2xl bg-fiber-surface/50 backdrop-blur-sm border border-fiber-border">
      {/* Header */}
      <div className="px-5 py-4 border-b border-fiber-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
            Payment History
          </h3>
          <span className="text-xs font-mono text-fiber-muted">
            {payments.length} total
          </span>
        </div>
      </div>

      {/* Payments list */}
      <div className="relative max-h-64 overflow-y-auto">
        {/* Fade overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-fiber-surface/50 to-transparent pointer-events-none z-10" />

        <AnimatePresence mode="popLayout">
          {recentPayments.length > 0 ? (
            <div className="divide-y divide-fiber-border/30">
              {recentPayments.map((payment, index) => (
                <motion.div
                  key={payment.timestamp}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="px-5 py-3 flex items-center justify-between hover:bg-fiber-border/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        payment.status === 'success'
                          ? 'bg-fiber-accent'
                          : payment.status === 'pending'
                          ? 'bg-fiber-warning'
                          : 'bg-red-500'
                      }`}
                    />

                    {/* Time */}
                    <span className="text-xs font-mono text-fiber-muted w-16">
                      {new Date(payment.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>

                    {/* Payment hash preview */}
                    {payment.paymentHash && (
                      <span className="text-[10px] font-mono text-fiber-muted/60 hidden sm:block">
                        {payment.paymentHash.slice(0, 10)}...
                      </span>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="flex items-baseline gap-1">
                    <motion.span
                      className={`text-sm font-mono tabular-nums ${
                        payment.status === 'success'
                          ? 'text-fiber-accent'
                          : payment.status === 'pending'
                          ? 'text-fiber-warning'
                          : 'text-red-400'
                      }`}
                      initial={index === 0 ? { scale: 1.2 } : {}}
                      animate={{ scale: 1 }}
                    >
                      -{formatShannon(payment.amountShannon, 6)}
                    </motion.span>
                    <span className="text-[10px] text-fiber-muted">CKB</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-fiber-border/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-fiber-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm text-fiber-muted">
                No payments yet. Start playing to stream payments.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

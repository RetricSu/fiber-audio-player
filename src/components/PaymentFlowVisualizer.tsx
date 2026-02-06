'use client';

import { motion } from 'motion/react';

interface PaymentFlowVisualizerProps {
  isActive: boolean;
  lastPayment: {
    amountShannon: bigint;
    status: 'pending' | 'success' | 'failed';
  } | null;
  totalPaid: string;
}

export function PaymentFlowVisualizer({
  isActive,
  lastPayment,
  totalPaid,
}: PaymentFlowVisualizerProps) {
  return (
    <div className="relative h-32 overflow-hidden rounded-2xl bg-fiber-surface/50 backdrop-blur-sm border border-fiber-border">
      {/* Background gradient flow */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          isActive ? 'opacity-100' : 'opacity-30'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-fiber-accent/5 via-fiber-flow/10 to-fiber-accent/5" />

        {/* Animated flow lines */}
        {isActive && (
          <>
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-px bg-gradient-to-r from-transparent via-fiber-accent/60 to-transparent"
                style={{
                  top: `${20 + i * 15}%`,
                  width: '100%',
                }}
                animate={{
                  x: ['-100%', '100%'],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2 + i * 0.3,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: i * 0.4,
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* Payment pulse effect */}
      {lastPayment?.status === 'success' && (
        <motion.div
          className="absolute inset-0 bg-fiber-accent/20"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center justify-between h-full px-6">
        <div className="space-y-1">
          <p className="text-xs text-fiber-muted font-mono uppercase tracking-wider">
            Payment Stream
          </p>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-display font-light tabular-nums ${
                isActive ? 'text-fiber-accent' : 'text-white/60'
              }`}
            >
              {totalPaid}
            </span>
            <span className="text-sm text-fiber-muted">CKB</span>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full transition-colors ${
                isActive ? 'bg-fiber-accent' : 'bg-fiber-muted'
              }`}
            />
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-fiber-accent"
                animate={{
                  scale: [1, 2],
                  opacity: [0.5, 0],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              />
            )}
          </div>
          <span className={`text-sm font-mono ${isActive ? 'text-fiber-accent' : 'text-fiber-muted'}`}>
            {isActive ? 'STREAMING' : 'PAUSED'}
          </span>
        </div>
      </div>

      {/* Bottom flow bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-fiber-border overflow-hidden">
        {isActive && (
          <motion.div
            className="h-full bg-gradient-to-r from-fiber-accent via-fiber-flow to-fiber-accent"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ width: '50%' }}
          />
        )}
      </div>
    </div>
  );
}

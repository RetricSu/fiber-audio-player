'use client';

import { motion, AnimatePresence } from 'motion/react';

interface PaymentLoadingSimpleProps {
  isVisible: boolean;
  status: 'loading' | 'success' | 'error';
  error?: string;
  onRetry?: () => void;
  onClose?: () => void;
}

export function PaymentLoadingSimple({
  isVisible,
  status,
  error,
  onRetry,
  onClose,
}: PaymentLoadingSimpleProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-fiber-dark/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-fiber-surface border border-fiber-border rounded-2xl shadow-2xl shadow-black/50 p-8 text-center"
          >
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-fiber-accent/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-fiber-flow/10 rounded-full blur-3xl" />

            <div className="relative z-10">
              {status === 'loading' && (
                <>
                  <div className="relative w-16 h-16 mx-auto mb-6">
                    <motion.div
                      className="w-16 h-16 rounded-full border-2 border-fiber-accent/30 border-t-fiber-accent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full bg-fiber-accent"
                      animate={{ scale: [1, 1.4], opacity: [0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                  <h3 className="text-lg font-display font-light text-white mb-2">
                    Processing payment...
                  </h3>
                  <p className="text-sm text-fiber-muted">
                    Please wait while we confirm your transaction
                  </p>
                </>
              )}

              {status === 'success' && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
                  >
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <h3 className="text-lg font-display font-light text-white mb-2">
                    Payment successful!
                  </h3>
                  <p className="text-sm text-fiber-muted">
                    Starting playback...
                  </p>
                </>
              )}

              {status === 'error' && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center"
                  >
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.div>
                  <h3 className="text-lg font-display font-light text-white mb-2">
                    Payment failed
                  </h3>
                  <p className="text-sm text-fiber-muted mb-6">
                    {error || 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="px-4 py-2 text-sm font-medium bg-fiber-accent text-fiber-dark rounded-lg hover:bg-fiber-accent/90 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                    {onClose && (
                      <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium border border-fiber-border text-fiber-muted hover:text-white hover:border-fiber-muted rounded-lg transition-colors"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

// Simple inline icons to avoid extra dependency
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ServerIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

const WifiOffIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const TerminalIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

// Error type configuration - defined outside component for performance
const errorConfig = {
  network: {
    Icon: WifiOffIcon,
    title: 'Connection Failed',
    description: 'Unable to reach the Fiber node at the specified RPC address.',
    color: 'text-fiber-warning',
    bgColor: 'bg-fiber-warning/10',
    borderColor: 'border-fiber-warning/30',
  },
  no_node: {
    Icon: ServerIcon,
    title: 'Node Not Running',
    description: 'No Fiber node detected at the specified address. The node may be offline or not started.',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  unknown: {
    Icon: WifiOffIcon,
    title: 'Connection Error',
    description: 'An unexpected error occurred while connecting to the Fiber node.',
    color: 'text-fiber-warning',
    bgColor: 'bg-fiber-warning/10',
    borderColor: 'border-fiber-warning/30',
  },
};

type ErrorType = keyof typeof errorConfig;

// Determine error type based on error message - defined outside component for performance
const getErrorType = (error: string | null): ErrorType => {
  if (!error) return 'unknown';
  const lowerError = error.toLowerCase();
  if (lowerError.includes('timeout') || lowerError.includes('fetch') || lowerError.includes('network')) {
    return 'network';
  }
  if (lowerError.includes('refused') || lowerError.includes('unreachable') || lowerError.includes('econnrefused')) {
    return 'no_node';
  }
  return 'unknown';
};

interface ConnectionErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: string | null;
  rpcUrl: string;
}

export function ConnectionErrorModal({ isOpen, onClose, error, rpcUrl }: ConnectionErrorModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const errorType = getErrorType(error);
  const config = errorConfig[errorType];
  const { Icon } = config;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal Container - centered with scroll support */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg max-h-[85vh] pointer-events-auto"
            >
              <div
                className="flex flex-col rounded-2xl bg-fiber-surface border border-fiber-border shadow-2xl overflow-hidden max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-fiber-border flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
                      <div className={config.color}><Icon /></div>
                    </div>
                    <h2 className="text-lg font-semibold text-white">{config.title}</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg text-fiber-muted hover:text-white hover:bg-fiber-border/50 transition-colors"
                  >
                    <XIcon />
                  </button>
                </div>

                {/* Content - scrollable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Error Description */}
                  <div className={`p-4 rounded-xl ${config.bgColor} ${config.borderColor} border`}>
                    <p className={`text-sm ${config.color}`}>{config.description}</p>
                    {error && (
                      <p className="mt-2 text-xs font-mono text-white/60 bg-black/20 p-2 rounded">
                        {error}
                      </p>
                    )}
                  </div>

                  {/* RPC URL */}
                  <div className="space-y-2">
                    <p className="text-xs font-mono uppercase tracking-wider text-fiber-muted">RPC URL</p>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-fiber-dark/50 border border-fiber-border">
                      <code className="text-sm font-mono text-white/80 flex-1 truncate">{rpcUrl}</code>
                    </div>
                  </div>

                  {/* Setup Instructions */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="text-fiber-accent"><TerminalIcon /></div>
                      <p className="text-sm font-medium text-white">How to start a local Fiber node</p>
                    </div>

                    <div className="p-4 rounded-xl bg-fiber-dark/30 border border-fiber-border/50 space-y-3">
                      <p className="text-sm text-fiber-muted">
                        You can run a local Fiber node using the{' '}
                        <span className="text-fiber-accent font-medium">fiber-pay</span> CLI tool:
                      </p>

                      <div className="space-y-2">
                        <p className="text-xs font-mono uppercase tracking-wider text-fiber-muted">1. Install</p>
                        <div className="relative">
                          <pre className="p-3 rounded-lg bg-black/40 text-xs font-mono text-white/80 overflow-x-auto">
                            npm install -g @fiber-pay/cli@next
                          </pre>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-mono uppercase tracking-wider text-fiber-muted">2. Start the node</p>
                        <div className="relative">
                          <pre className="p-3 rounded-lg bg-black/40 text-xs font-mono text-white/80 overflow-x-auto">
                            fiber-pay node start
                          </pre>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-fiber-border/30">
                        <p className="text-xs text-fiber-muted">
                          Use this RPC endpoint in the player:{' '}
                          <code className="text-fiber-accent">http://127.0.0.1:8229</code>
                        </p>
                        <p className="text-[10px] text-fiber-muted/60 mt-1">
                          (via fiber-pay runtime proxy for CORS support)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-fiber-border bg-fiber-dark/20 flex-shrink-0">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
                  >
                    Close
                  </button>
                  <a
                    href="https://github.com/RetricSu/fiber-pay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-fiber-accent/20 text-fiber-accent hover:bg-fiber-accent/30 border border-fiber-accent/50 transition-colors"
                  >
                    View fiber-pay Docs
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

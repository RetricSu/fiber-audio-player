'use client';

import { motion } from 'motion/react';

interface NodeStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: {
    version: string;
    public_key: string;
    node_name: string | null;
    open_channel_count: number;
    peers_count: number;
  } | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function NodeStatus({
  isConnected,
  isConnecting,
  nodeInfo,
  error,
  onConnect,
  onDisconnect,
}: NodeStatusProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-fiber-surface/50 backdrop-blur-sm border border-fiber-border p-5">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="0.5" fill="currentColor" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <motion.div
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected
                    ? 'bg-fiber-accent'
                    : isConnecting
                    ? 'bg-fiber-warning'
                    : 'bg-fiber-muted'
                }`}
                animate={
                  isConnecting
                    ? { scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }
                    : {}
                }
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              {isConnected && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-fiber-accent"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>
            <h3 className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
              Fiber Node
            </h3>
          </div>

          <button
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={isConnecting}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all ${
              isConnected
                ? 'bg-fiber-border text-white/70 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50'
                : 'bg-fiber-accent/20 text-fiber-accent hover:bg-fiber-accent/30 border border-fiber-accent/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30"
          >
            <p className="text-xs text-red-400 font-mono">{error}</p>
          </motion.div>
        )}

        {/* Node info */}
        {isConnected && nodeInfo ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-fiber-dark/50">
                <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                  Channels
                </p>
                <p className="text-xl font-display text-white">
                  {nodeInfo.open_channel_count}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-fiber-dark/50">
                <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                  Peers
                </p>
                <p className="text-xl font-display text-white">
                  {nodeInfo.peers_count}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-fiber-dark/50">
              <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                Node ID
              </p>
              <p className="text-xs font-mono text-white/70 truncate">
                {nodeInfo.public_key}
              </p>
            </div>

            {nodeInfo.node_name && (
              <div className="p-3 rounded-lg bg-fiber-dark/50">
                <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                  Name
                </p>
                <p className="text-sm font-mono text-white/90">{nodeInfo.node_name}</p>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-mono text-fiber-muted">
              <span>v{nodeInfo.version}</span>
              <span className="text-fiber-accent">● LIVE</span>
            </div>
          </motion.div>
        ) : !isConnecting && !error ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-fiber-border/50 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-fiber-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <p className="text-sm text-fiber-muted">
              Connect to your local Fiber node to enable streaming payments
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

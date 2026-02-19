'use client';

import { motion } from 'motion/react';
import { ChannelStatus } from '@/hooks/use-fiber-node';
import { NodeInfo, fromHex } from '@/lib/fiber-rpc';

interface NodeStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: NodeInfo | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  // Channel status props
  channelStatus?: ChannelStatus;
  channelError?: string | null;
  channelStateName?: string | null;
  channelElapsed?: number;
  availableBalance?: string;
  onCheckRoute?: () => void;
  onOpenChannel?: () => void;
  onCancelSetup?: () => void;
}

export function NodeStatus({
  isConnected,
  isConnecting,
  nodeInfo,
  error,
  onConnect,
  onDisconnect,
  channelStatus = 'idle',
  channelError,
  channelStateName,
  channelElapsed = 0,
  availableBalance = '0',
  onCheckRoute,
  onOpenChannel,
  onCancelSetup,
}: NodeStatusProps) {
  const getChannelStatusDisplay = () => {
    switch (channelStatus) {
      case 'checking':
        return { text: 'Checking route...', color: 'text-fiber-warning', bg: 'bg-fiber-warning/10' };
      case 'opening_channel':
        return { text: 'Opening channel...', color: 'text-fiber-warning', bg: 'bg-fiber-warning/10' };
      case 'waiting_confirmation':
        return { text: 'Waiting for confirmation...', color: 'text-fiber-warning', bg: 'bg-fiber-warning/10' };
      case 'ready':
        return { text: 'Route available', color: 'text-fiber-accent', bg: 'bg-fiber-accent/10' };
      case 'no_route':
        return { text: 'No route found', color: 'text-red-400', bg: 'bg-red-500/10' };
      case 'error':
        return { text: 'Error', color: 'text-red-400', bg: 'bg-red-500/10' };
      default:
        return null;
    }
  };

  const channelStatusDisplay = getChannelStatusDisplay();
  const isChannelBusy = channelStatus === 'checking' || channelStatus === 'opening_channel' || channelStatus === 'waiting_confirmation';

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
                  {Number(fromHex(nodeInfo.channel_count))}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-fiber-dark/50">
                <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                  Peers
                </p>
                <p className="text-xl font-display text-white">
                  {Number(fromHex(nodeInfo.peers_count))}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-fiber-dark/50">
              <p className="text-[10px] text-fiber-muted font-mono uppercase tracking-wider mb-1">
                Node ID
              </p>
              <p className="text-xs font-mono text-white/70 truncate">
                {nodeInfo.node_id}
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

            {/* Channel/Route Status */}
            {channelStatusDisplay && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg ${channelStatusDisplay.bg} border border-current/20`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${channelStatusDisplay.color}`}>
                    {channelStatusDisplay.text}
                  </span>
                  <div className="flex items-center gap-2">
                    {isChannelBusy && channelElapsed > 0 && (
                      <span className="text-[10px] font-mono text-fiber-muted tabular-nums">
                        {Math.floor(channelElapsed / 60)}:{(channelElapsed % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                    {isChannelBusy && (
                      <motion.div
                        className="w-3 h-3 border-2 border-fiber-warning border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    )}
                  </div>
                </div>
                {channelStatus === 'ready' && availableBalance !== '0' && (
                  <p className="text-xs text-fiber-muted">
                    Available: <span className="text-white">{availableBalance} CKB</span>
                  </p>
                )}
                {channelStatus === 'waiting_confirmation' && (
                  <div className="space-y-1.5">
                    {channelStateName && (
                      <p className="text-[10px] font-mono text-fiber-muted">
                        State: <span className="text-white/70">{channelStateName}</span>
                      </p>
                    )}
                    <p className="text-xs text-fiber-muted">
                      Channel is being confirmed on-chain. This may take a few minutes.
                    </p>
                    {onCancelSetup && (
                      <button
                        onClick={onCancelSetup}
                        className="mt-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-fiber-dark/80 text-fiber-muted hover:text-red-400 hover:bg-red-500/10 border border-fiber-border hover:border-red-500/30 transition-all"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
                {channelError && (
                  <p className="text-xs text-red-400 mt-1">{channelError}</p>
                )}
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {/* Check Route Button */}
              {onCheckRoute && (
                <button
                  onClick={onCheckRoute}
                  disabled={isChannelBusy}
                  className="flex-1 py-2 px-3 text-xs font-mono uppercase tracking-wider rounded-lg bg-fiber-dark/50 text-fiber-muted hover:text-fiber-accent hover:bg-fiber-accent/10 border border-fiber-border hover:border-fiber-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {channelStatus === 'ready' ? 'Re-check' : 'Check Route'}
                </button>
              )}

              {/* Open Channel Button - show when no route or error */}
              {onOpenChannel && (channelStatus === 'no_route' || channelStatus === 'error') && (
                <button
                  onClick={onOpenChannel}
                  disabled={isChannelBusy}
                  className="flex-1 py-2 px-3 text-xs font-mono uppercase tracking-wider rounded-lg bg-fiber-accent/20 text-fiber-accent hover:bg-fiber-accent/30 border border-fiber-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Open Channel
                </button>
              )}
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

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeStatus } from './NodeStatus';
import { NodeInfo } from '@/lib/fiber-rpc';
import { ChannelStatus } from '@/hooks/use-fiber-node';

interface HeaderProps {
  // Node status props
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: NodeInfo | null;
  error: string | null;
  rpcUrl?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  // Channel status
  channelStatus?: ChannelStatus;
  channelError?: string | null;
  channelStateName?: string | null;
  channelElapsed?: number;
  availableBalance?: string;
  channelCount?: number;
  peerCount?: number;
  fundingAmountCkb?: number;
  fundingBalanceCkb?: number | null;
  isFundingSufficient?: boolean;
  fundingBalanceError?: string | null;
  faucetUrl?: string;
  onCheckRoute?: () => void;
  onOpenChannel?: () => void;
  onCancelSetup?: () => void;
  recipientPubkey?: string;
  recipientMultiaddrConfigured?: boolean;
  // RPC URL config
  rpcUrlValue?: string;
  onRpcUrlChange?: (url: string) => void;
  onRequestEditUrl?: () => void;
  // Backend error
  backendError?: string | null;
}

export function Header({
  isConnected,
  isConnecting,
  nodeInfo,
  error,
  rpcUrl = 'http://127.0.0.1:28229',
  onConnect,
  onDisconnect,
  channelStatus = 'idle',
  channelError,
  channelStateName,
  channelElapsed = 0,
  availableBalance = '0',
  channelCount = 0,
  peerCount = 0,
  fundingAmountCkb = 1000,
  fundingBalanceCkb = null,
  isFundingSufficient = false,
  fundingBalanceError,
  faucetUrl,
  onCheckRoute,
  onOpenChannel,
  onCancelSetup,
  recipientPubkey,
  recipientMultiaddrConfigured = false,
  rpcUrlValue,
  onRpcUrlChange,
  backendError,
  onRequestEditUrl,
}: HeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getButtonStatus = () => {
    if (isConnecting) return { text: 'Connecting...', color: 'bg-fiber-warning' };
    if (!isConnected) return { text: 'Connect Node', color: 'bg-fiber-muted' };
    if (channelStatus === 'ready') return { text: 'Node Ready', color: 'bg-fiber-accent' };
    return { text: 'Node Connected', color: 'bg-fiber-accent' };
  };

  const buttonStatus = getButtonStatus();

  return (
    <motion.header
      className="py-4 px-4 sm:px-6 lg:px-8 border-b border-fiber-border/50 bg-fiber-dark/80 backdrop-blur-sm sticky top-0 z-50"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-fiber-accent/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-fiber-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <motion.div
              className="absolute inset-0 rounded-xl bg-fiber-accent/30"
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <div>
            <h1 className="text-xl font-display font-light text-white">
              Fiber <span className="text-gradient">Audio</span>
            </h1>
            <p className="text-xs text-fiber-muted">Stream. Listen. Pay.</p>
          </div>
        </div>

        {/* Right side - Backend error or Node Connect Button */}
        <div className="flex items-center gap-4">
          {backendError && (
            <div className="text-xs text-red-400 font-mono hidden sm:block">{backendError}</div>
          )}

          {/* Node Connect Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-fiber-border/70 bg-fiber-surface/80 hover:bg-fiber-surface transition-all group"
            >
              {/* Status indicator */}
              <div className="relative">
                <motion.div
                  className={`w-2.5 h-2.5 rounded-full ${buttonStatus.color}`}
                  animate={
                    isConnecting
                      ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }
                      : isConnected
                      ? {}
                      : {}
                  }
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
                {isConnected && channelStatus === 'ready' && (
                  <motion.div
                    className={`absolute inset-0 rounded-full ${buttonStatus.color}`}
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>

              <span className="text-sm font-mono text-white/90 hidden sm:inline">
                {buttonStatus.text}
              </span>

              {/* Dropdown arrow */}
              <motion.svg
                className="w-4 h-4 text-fiber-muted group-hover:text-fiber-accent transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </motion.svg>
            </button>

            {/* Dropdown Panel */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 top-full mt-2 w-[400px] max-w-[90vw] z-50"
                >
                  <div className="rounded-2xl bg-fiber-surface/95 backdrop-blur-md border border-fiber-border/90 shadow-2xl shadow-black/50 overflow-hidden">
                    <NodeStatus
                      isConnected={isConnected}
                      isConnecting={isConnecting}
                      nodeInfo={nodeInfo}
                      error={error}
                      rpcUrl={rpcUrl}
                      onConnect={onConnect}
                      onDisconnect={onDisconnect}
                      channelStatus={channelStatus}
                      channelError={channelError}
                      channelStateName={channelStateName}
                      channelElapsed={channelElapsed}
                      availableBalance={availableBalance}
                      channelCount={channelCount}
                      peerCount={peerCount}
                      fundingAmountCkb={fundingAmountCkb}
                      fundingBalanceCkb={fundingBalanceCkb}
                      isFundingSufficient={isFundingSufficient}
                      fundingBalanceError={fundingBalanceError}
                      faucetUrl={faucetUrl}
                      recipientPubkey={recipientPubkey}
                      recipientMultiaddrConfigured={recipientMultiaddrConfigured}
                      onCheckRoute={onCheckRoute}
                      onOpenChannel={onOpenChannel}
                      onCancelSetup={onCancelSetup}
                      onRequestEditUrl={onRequestEditUrl}
                      topConfigPanel={
                        !isConnected ? (
                          <div>
                            <label className="block text-xs text-fiber-muted/95 mb-2 font-mono uppercase tracking-wider">
                              Fiber RPC URL
                            </label>
                            <div className="relative group">
                              <input
                                type="text"
                                value={rpcUrlValue || rpcUrl}
                                onChange={(e) => onRpcUrlChange?.(e.target.value)}
                                className="w-full px-3 py-2 pr-10 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent focus:ring-1 focus:ring-fiber-accent/30 hover:bg-fiber-surface/50 transition-all duration-200"
                                placeholder="http://127.0.0.1:28229"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-fiber-muted group-hover:text-fiber-accent transition-colors pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                              </div>
                            </div>
                          </div>
                        ) : null
                      }
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ChannelStatus } from '@/hooks/use-fiber-node';
import { NodeInfo, scriptToAddress } from '@/lib/fiber-rpc';
import { ConnectionErrorModal } from './ConnectionErrorModal';
import QRCode from 'qrcode';

interface NodeStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  nodeInfo: NodeInfo | null;
  error: string | null;
  rpcUrl?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  // Channel status props
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
  fundingNetwork?: 'testnet' | 'mainnet';
  onCheckRoute?: () => void;
  onOpenChannel?: () => void;
  onCancelSetup?: () => void;
  recipientPubkey?: string;
  recipientMultiaddrConfigured?: boolean;
  topConfigPanel?: ReactNode;
  onRequestEditUrl?: () => void;
}

export function NodeStatus({
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
  fundingNetwork = 'testnet',
  onCheckRoute,
  onOpenChannel,
  onCancelSetup,
  recipientPubkey,
  recipientMultiaddrConfigured = false,
  topConfigPanel,
  onRequestEditUrl,
}: NodeStatusProps) {
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [fundingAddress, setFundingAddress] = useState<string | null>(null);
  const [fundingAddressError, setFundingAddressError] = useState<string | null>(null);
  const [fundingQrDataUrl, setFundingQrDataUrl] = useState<string | null>(null);
  const [fundingQrError, setFundingQrError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const wasConnectingRef = useRef(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show error modal only once per failed connect attempt.
  useEffect(() => {
    const connectAttemptJustFinished = wasConnectingRef.current && !isConnecting;

    if (connectAttemptJustFinished && error && !isConnected) {
      setShowErrorModal(true);
    }

    if (!error) {
      setShowErrorModal(false);
    }

    wasConnectingRef.current = isConnecting;
  }, [error, isConnecting, isConnected]);

  useEffect(() => {
    if (!isConnected || !nodeInfo) {
      setFundingAddress(null);
      setFundingAddressError(null);
      return;
    }

    try {
      const address = scriptToAddress(nodeInfo.default_funding_lock_script, fundingNetwork);
      setFundingAddress(address);
      setFundingAddressError(null);
    } catch (err) {
      setFundingAddress(null);
      setFundingAddressError(err instanceof Error ? err.message : 'Failed to derive funding address');
    }
  }, [fundingNetwork, isConnected, nodeInfo]);

  useEffect(() => {
    let canceled = false;

    const buildQrCode = async () => {
      if (!fundingAddress) {
        setFundingQrDataUrl(null);
        setFundingQrError(null);
        return;
      }

      try {
        setFundingQrError(null);
        const dataUrl = await QRCode.toDataURL(fundingAddress, {
          width: 160,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#e8f0ff',
            light: '#00000000',
          },
        });

        if (!canceled) {
          setFundingQrDataUrl(dataUrl);
        }
      } catch {
        if (!canceled) {
          setFundingQrDataUrl(null);
          setFundingQrError('Failed to generate funding QR code. You can still copy the address manually.');
        }
      }
    };

    void buildQrCode();

    return () => {
      canceled = true;
    };
  }, [fundingAddress]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyFundingAddress = async () => {
    if (!fundingAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(fundingAddress);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = setTimeout(() => {
      setCopyStatus('idle');
    }, 2000);
  };

  const handleConnectToggle = () => {
    if (isConnected) {
      onDisconnect();
      return;
    }

    // Clear stale modal state before a new attempt.
    setShowErrorModal(false);
    onConnect();
  };

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
  const shouldDisableOpenChannel = isChannelBusy || !isFundingSufficient;

  return (
    <div className="relative overflow-visible rounded-2xl bg-fiber-surface/85 backdrop-blur-sm border border-fiber-border/90 p-5">
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
          <div className="flex items-center mb-4">
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
              <h3 className="text-sm font-mono uppercase tracking-wider text-fiber-muted/95">
                Fiber Node
              </h3>
            </div>
          </div>

          {/* Top config panel (inside node body) */}
          {topConfigPanel && <div className="mb-4">{topConfigPanel}</div>}

          {/* Error state */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors"
              onClick={() => setShowErrorModal(true)}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-red-400 font-mono">{error}</p>
                <span className="text-xs text-red-300/70 font-mono">Click for help →</span>
              </div>
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
              <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
                <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                  Channels
                </p>
                <p className="text-xl font-display text-white/95">
                  {channelCount}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
                <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                  Peers
                </p>
                <p className="text-xl font-display text-white/95">
                  {peerCount}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
                <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                  Funding Amount
                </p>
                <p className="text-sm font-display text-white/95">
                  {fundingAmountCkb} CKB
                </p>
              </div>
              <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
                <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                  Funding Balance
                </p>
                <p className="text-sm font-display text-white/95">
                  {fundingBalanceCkb === null ? 'N/A' : `${fundingBalanceCkb.toFixed(4)} CKB`}
                </p>
              </div>
            </div>

            {fundingBalanceError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400 font-mono">
                  Funding balance check failed: {fundingBalanceError}
                </p>
              </div>
            )}

            {!isFundingSufficient && (
              <div className="p-3 rounded-lg bg-fiber-warning/10 border border-fiber-warning/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-fiber-warning font-mono uppercase tracking-wider">
                    Funding Top-up Needed
                  </p>
                  <span className="text-[11px] text-fiber-muted/95 font-mono uppercase tracking-wider">
                    {fundingNetwork}
                  </span>
                </div>

                <p className="text-xs text-fiber-muted/95">
                  Funding balance is below <span className="text-white/95">{fundingAmountCkb} CKB</span>. Deposit more CKB to this address before opening a channel.
                </p>

                {fundingAddress ? (
                  <>
                    <div className="rounded-lg border border-fiber-border/70 bg-fiber-dark/80 p-2.5">
                      <p className="text-[11px] text-fiber-muted/95 font-mono uppercase tracking-wider mb-1.5">
                        Deposit Address
                      </p>
                      <p className="text-[11px] text-white/95 font-mono break-all leading-relaxed">
                        {fundingAddress}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyFundingAddress}
                        className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border border-fiber-accent/60 text-fiber-accent hover:bg-fiber-accent/20 transition-colors"
                      >
                        {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy Failed' : 'Copy Address'}
                      </button>

                      {faucetUrl && (
                        <a
                          href={faucetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded border border-fiber-warning/40 text-fiber-warning hover:bg-fiber-warning/10 transition-colors"
                        >
                          Go to Faucet
                        </a>
                      )}
                    </div>

                    {fundingQrDataUrl && (
                      <div className="inline-flex flex-col gap-1.5 rounded-lg border border-fiber-border/70 bg-fiber-dark/80 p-2">
                        <p className="text-[10px] text-fiber-muted/95 font-mono uppercase tracking-wider">
                          Scan to Deposit
                        </p>
                        <img
                          src={fundingQrDataUrl}
                          alt="Funding address QR code"
                          className="w-40 h-40 rounded bg-white/5"
                        />
                      </div>
                    )}

                    {fundingQrError && (
                      <p className="text-xs text-red-300/90 font-mono">{fundingQrError}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-red-300/90 font-mono">
                    Unable to derive deposit address from funding lock script.
                    {fundingAddressError ? ` ${fundingAddressError}` : ''}
                  </p>
                )}
              </div>
            )}

            <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
              <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                Node ID
              </p>
              <p className="text-xs font-mono text-white/90 truncate">
                {nodeInfo.pubkey}
              </p>
            </div>

            {nodeInfo.node_name && (
              <div className="p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
                <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
                  Name
                </p>
                <p className="text-sm font-mono text-white/95">{nodeInfo.node_name}</p>
              </div>
            )}

            <div className="flex items-center justify-between text-xs font-mono text-fiber-muted/95">
              <span className="text-white/85">v{nodeInfo.version}</span>
              <span className="text-fiber-accent">● LIVE</span>
            </div>

            </motion.div>
          ) : null}

        {/* Recipient pubkey (read-only, set by deployer) */}
        {recipientPubkey && (
          <div className="mt-4 p-3 rounded-lg bg-fiber-dark/75 border border-fiber-border/60">
            <p className="text-xs text-fiber-muted/95 font-mono uppercase tracking-wider mb-1">
              Paying To
            </p>
            <p className="text-xs font-mono text-white/90 truncate" title={recipientPubkey}>
              {recipientPubkey}
            </p>
          </div>
        )}
        {!recipientPubkey && isConnected && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-xs text-red-400 font-mono">
              Recipient pubkey is unavailable from backend /node-info. Check backend Fiber RPC connectivity and node-info compatibility.
            </p>
          </div>
        )}
        {recipientPubkey && isConnected && !recipientMultiaddrConfigured && (
          <div className="mt-3 p-3 rounded-lg bg-fiber-warning/10 border border-fiber-warning/30">
            <p className="text-xs text-fiber-warning font-mono">
              Auto peer bootstrap disabled. Set NEXT_PUBLIC_BOOTNODE_MULTIADDR for local RPC mode and/or NEXT_PUBLIC_BOOTNODE_MULTIADDR_BROWSER for browser passkey mode.
            </p>
          </div>
        )}

        {/* Bottom action buttons */}
        {isConnected && (onCheckRoute || onOpenChannel) && (
          <div className="mt-4">
            {channelStatusDisplay && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg ${channelStatusDisplay.bg} border border-current/20 mb-3`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${channelStatusDisplay.color}`}>
                    {channelStatusDisplay.text}
                  </span>
                  <div className="flex items-center gap-2">
                    {isChannelBusy && channelElapsed > 0 && (
                      <span className="text-xs font-mono text-fiber-muted/95 tabular-nums">
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
                  <p className="text-xs text-fiber-muted/95">
                    Available: <span className="text-white/95">{availableBalance} CKB</span>
                  </p>
                )}
                {channelStatus === 'waiting_confirmation' && (
                  <div className="space-y-1.5">
                    {channelStateName && (
                      <p className="text-xs font-mono text-fiber-muted/95">
                        State: <span className="text-white/90">{channelStateName}</span>
                      </p>
                    )}
                    <p className="text-xs text-fiber-muted/95">
                      Channel is being confirmed on-chain. This may take a few minutes.
                    </p>
                    {onCancelSetup && (
                      <button
                        onClick={onCancelSetup}
                        className="mt-1.5 px-2 py-1 text-xs font-mono uppercase tracking-wider rounded bg-fiber-dark/80 text-fiber-muted hover:text-red-400 hover:bg-red-500/10 border border-fiber-border hover:border-red-500/30 transition-all"
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

            {!isFundingSufficient && (channelStatus === 'no_route' || channelStatus === 'error') && (
              <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400">
                  Funding balance is below {fundingAmountCkb} CKB. Please top up first before opening a channel.
                  {faucetUrl && (
                    <>
                      {' '}
                      <a
                        href={faucetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-red-300 hover:text-red-200"
                      >
                        Go to faucet
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="flex items-stretch gap-2">
              {onCheckRoute && (
                <button
                  onClick={onCheckRoute}
                  disabled={isChannelBusy}
                  className="flex-1 py-2.5 px-3 min-h-12 text-xs font-mono uppercase tracking-wider rounded-lg bg-fiber-accent/20 text-white/95 hover:text-white hover:bg-fiber-accent/30 border border-fiber-accent/60 shadow-[0_0_0_1px_rgba(0,255,163,0.08)] hover:shadow-[0_0_20px_rgba(0,255,163,0.22)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {channelStatus === 'ready' ? 'Re-check' : 'Check Route'}
                </button>
              )}

              {onOpenChannel && channelStatus === 'no_route' && channelCount === 0 && (
                <button
                  onClick={onOpenChannel}
                  disabled={shouldDisableOpenChannel}
                  className="flex-1 py-2.5 px-3 min-h-12 text-xs font-mono uppercase tracking-wider rounded-lg bg-fiber-accent/25 text-fiber-accent hover:bg-fiber-accent/35 border border-fiber-accent/70 shadow-[0_0_20px_rgba(0,255,163,0.16)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Open Channel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Connect / Disconnect action */}
        <div className="mt-4 pt-4 border-t border-fiber-border/50">
          <button
            onClick={handleConnectToggle}
            disabled={isConnecting}
            className={`w-full px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all border ${
              isConnected
                ? 'bg-fiber-border/90 text-white/90 border-fiber-border hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50'
                : 'bg-fiber-accent/20 text-fiber-accent hover:bg-fiber-accent/30 border-fiber-accent/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Connection Error Modal */}
      <ConnectionErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        error={error}
        rpcUrl={rpcUrl}
        onRequestEditUrl={onRequestEditUrl}
      />
    </div>
  );
}

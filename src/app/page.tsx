'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NodeStatus } from '@/components/NodeStatus';
import { PaymentHistory } from '@/components/PaymentHistory';
import { PodcastList, Podcast } from '@/components/PodcastList';
import { EpisodeList } from '@/components/EpisodeList';
import { Episode } from '@/components/EpisodeCard';
import { useFiberNode } from '@/hooks/use-fiber-node';
import { useStreamingPayment } from '@/hooks/use-streaming-payment';
import { getBackendNodeInfo } from '@/lib/stream-auth';

// Default configuration
const DEFAULT_RPC_URL = 'http://127.0.0.1:28229';
const FAUCET_URL = 'https://testnet.ckbapp.dev/';

// Bootnode multiaddr — for the user's node to join the Fiber network.
const BOOTNODE_MULTIADDR = process.env.NEXT_PUBLIC_BOOTNODE_MULTIADDR || '';

// Default cover image for episodes
const DEFAULT_COVER_URL = 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&h=400&fit=crop&auto=format';

/**
 * Convert backend Episode to AudioPlayer Episode format
 */
function toAudioPlayerEpisode(episode: Episode): {
  id: string;
  title: string;
  artist: string;
  description: string;
  duration: string;
  audioUrl: string;
  coverUrl: string;
  pricePerSecond: number;
} {
  // Format duration from seconds to MM:SS or HH:MM:SS
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return 'Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Convert price_per_second from shannon to CKB
  const pricePerSecond = parseFloat(episode.price_per_second) / 100_000_000;

  return {
    id: episode.id,
    title: episode.title,
    artist: 'Podcast Episode',
    description: episode.description || '',
    duration: formatDuration(episode.duration),
    audioUrl: episode.hls_url || '',
    coverUrl: DEFAULT_COVER_URL,
    pricePerSecond,
  };
}

export default function Home() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // Auto-fetch the developer node's pubkey from backend /node-info
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    getBackendNodeInfo()
      .then((info) => {
        setRecipientPubkey(info.nodeId);
        setBackendError(null);
      })
      .catch((err) => {
        setBackendError(err instanceof Error ? err.message : 'Failed to reach backend');
      });
  }, []);

  const fiberNode = useFiberNode(rpcUrl, {
    recipientPubkey,
    recipientMultiaddr: BOOTNODE_MULTIADDR,
  });

  const payment = useStreamingPayment({
    rpcUrl,
    recipientPubkey,
    ratePerSecond: selectedEpisode 
      ? parseFloat(selectedEpisode.price_per_second) / 100_000_000 
      : 0.0001,
  });

  const handlePodcastSelect = (podcast: Podcast) => {
    setSelectedPodcast(podcast);
    setSelectedEpisode(null); // Reset episode when podcast changes
  };

  const handleEpisodeSelect = (episode: Episode) => {
    setSelectedEpisode(episode);
  };

  const handleBackToPodcasts = () => {
    setSelectedPodcast(null);
    setSelectedEpisode(null);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.header
        className="py-6 px-4 sm:px-6 lg:px-8 border-b border-fiber-border/50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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

          {backendError && (
            <div className="text-xs text-red-400 font-mono">{backendError}</div>
          )}
        </div>
      </motion.header>

      {/* Main content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Podcast and Episode browsing */}
        <motion.div
          className="w-1/3 min-w-[320px] max-w-[450px] border-r border-fiber-border/50 overflow-hidden flex flex-col bg-fiber-dark/50"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {/* Breadcrumb / Navigation */}
          <div className="p-4 border-b border-fiber-border/30">
            {selectedPodcast ? (
              <button
                onClick={handleBackToPodcasts}
                className="flex items-center gap-2 text-sm text-fiber-muted hover:text-fiber-accent transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Podcasts</span>
              </button>
            ) : (
              <span className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
                Browse Podcasts
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {!selectedPodcast ? (
                <motion.div
                  key="podcast-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <PodcastList 
                    onPodcastSelect={handlePodcastSelect}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="episode-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Podcast header in episode list */}
                  <div className="p-4 border-b border-fiber-border/30 bg-fiber-surface/30">
                    <h2 className="font-semibold text-white truncate">{selectedPodcast.title}</h2>
                    {selectedPodcast.description && (
                      <p className="text-xs text-fiber-muted line-clamp-2 mt-1">
                        {selectedPodcast.description}
                      </p>
                    )}
                  </div>
                  <EpisodeList 
                    podcastId={selectedPodcast.id}
                    onEpisodeSelect={handleEpisodeSelect}
                    selectedEpisodeId={selectedEpisode?.id}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Main content - Player and Node Status */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 lg:p-8">
            {/* Player Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-8"
            >
              {selectedEpisode ? (
                <AudioPlayer
                  episode={toAudioPlayerEpisode(selectedEpisode)}
                  isFiberConnected={fiberNode.isConnected}
                  isRouteReady={fiberNode.channelStatus === 'ready'}
                  payment={payment}
                />
              ) : (
                <div className="rounded-3xl bg-fiber-surface/40 border border-fiber-border/50 p-12 text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-fiber-surface border border-fiber-border mb-6">
                    <svg className="w-10 h-10 text-fiber-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-display text-white mb-2">
                    Select an Episode to Play
                  </h3>
                  <p className="text-fiber-muted max-w-md mx-auto">
                    Browse podcasts from the sidebar, select an episode, and start listening with streaming micropayments via Fiber Network.
                  </p>
                </div>
              )}
            </motion.div>

            {/* Node Status and Payment History */}
            <motion.div
              className="grid md:grid-cols-2 gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {/* Node Status */}
              <div className="relative z-30">
                <NodeStatus
                  isConnected={fiberNode.isConnected}
                  isConnecting={fiberNode.isConnecting}
                  nodeInfo={fiberNode.nodeInfo}
                  error={fiberNode.error}
                  rpcUrl={rpcUrl}
                  onConnect={fiberNode.connect}
                  onDisconnect={fiberNode.disconnect}
                  channelStatus={fiberNode.channelStatus}
                  channelError={fiberNode.channelError}
                  channelStateName={fiberNode.channelStateName}
                  channelElapsed={fiberNode.channelElapsed}
                  availableBalance={fiberNode.availableBalance}
                  channelCount={fiberNode.channels.length}
                  peerCount={fiberNode.peers.length}
                  fundingAmountCkb={fiberNode.fundingAmountCkb}
                  fundingBalanceCkb={fiberNode.fundingBalanceCkb}
                  isFundingSufficient={fiberNode.isFundingSufficient}
                  fundingBalanceError={fiberNode.fundingBalanceError}
                  faucetUrl={FAUCET_URL}
                  recipientPubkey={recipientPubkey}
                  recipientMultiaddrConfigured={Boolean(BOOTNODE_MULTIADDR.trim())}
                  onCheckRoute={() => fiberNode.checkPaymentRoute(recipientPubkey)}
                  onOpenChannel={() => fiberNode.setupChannel(recipientPubkey)}
                  onCancelSetup={fiberNode.cancelChannelSetup}
                  topConfigPanel={
                    !fiberNode.isConnected ? (
                      <div>
                        <label className="block text-xs text-fiber-muted/95 mb-2 font-mono uppercase tracking-wider">
                          Fiber RPC URL
                        </label>
                        <input
                          type="text"
                          value={rpcUrl}
                          onChange={(e) => setRpcUrl(e.target.value)}
                          className="w-full px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                          placeholder="http://127.0.0.1:28229"
                        />
                      </div>
                    ) : null
                  }
                />
              </div>

              {/* Payment History */}
              <div className="relative z-10">
                <PaymentHistory payments={payment.paymentHistory} />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

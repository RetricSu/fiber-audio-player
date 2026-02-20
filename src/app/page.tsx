'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NodeStatus } from '@/components/NodeStatus';
import { PaymentHistory } from '@/components/PaymentHistory';
import { PeerSelector } from '@/components/PeerSelector';
import { useFiberNode } from '@/hooks/use-fiber-node';
import { useStreamingPayment } from '@/hooks/use-streaming-payment';

// Demo episode data
const DEMO_EPISODE = {
  id: '1',
  title: 'The Future of Digital Payments',
  artist: 'Fiber Network Podcast',
  description:
    'Exploring how Lightning-style payment channels are revolutionizing micropayments on CKB. Join us as we dive deep into the world of instant, low-cost transactions.',
  duration: '45:30',
  // Using a sample audio file from the web
  audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  // Placeholder cover image
  coverUrl: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&h=400&fit=crop&auto=format',
  pricePerSecond: 0.0001, // 0.0001 CKB per second
};

// Default configuration
const DEFAULT_RPC_URL = 'http://127.0.0.1:8229';

export default function Home() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [recipientPeerId, setRecipientPeerId] = useState('');
  const [recipientMode, setRecipientMode] = useState<'peer' | 'manual'>('peer');
  const [peerAddress, setPeerAddress] = useState('');

  const fiberNode = useFiberNode(rpcUrl);

  const truncateId = (value: string, prefixLen = 10, suffixLen = 8) => {
    if (!value) return 'Not set';
    if (value.length <= prefixLen + suffixLen + 3) return value;
    return `${value.slice(0, prefixLen)}...${value.slice(-suffixLen)}`;
  };

  const activeRecipientPeer = fiberNode.peers.find((peer) => peer.peer_id === recipientPeerId);

  // When user selects a peer from PeerSelector, update both peer_id and pubkey
  const handlePeerSelect = (peerId: string) => {
    setRecipientMode('peer');
    setRecipientPeerId(peerId);
    const peer = fiberNode.peers.find((p) => p.peer_id === peerId);
    if (peer?.pubkey) {
      setRecipientPubkey(peer.pubkey);
    }
  };

  const handleRecipientModeChange = (mode: 'peer' | 'manual') => {
    setRecipientMode(mode);

    if (mode === 'manual') {
      setRecipientPeerId('');
      return;
    }

    if (fiberNode.peers.length === 0) return;

    const preferredPeer =
      fiberNode.peers.find((peer) => peer.peer_id === recipientPeerId) ||
      fiberNode.peers.find((peer) => peer.pubkey === recipientPubkey) ||
      fiberNode.peers[0];

    setRecipientPeerId(preferredPeer.peer_id);
    if (preferredPeer.pubkey) {
      setRecipientPubkey(preferredPeer.pubkey);
    }
  };

  // Auto-select first peer if connected and no peer selected
  useEffect(() => {
    if (!fiberNode.isConnected || fiberNode.peers.length === 0) return;

    if (recipientMode === 'manual') return;

    if (recipientPeerId) {
      const selectedPeerStillExists = fiberNode.peers.some((peer) => peer.peer_id === recipientPeerId);
      if (!selectedPeerStillExists) {
        setRecipientPeerId('');
      }
      return;
    }

    if (recipientPubkey) {
      const matchingPeer = fiberNode.peers.find((peer) => peer.pubkey === recipientPubkey);
      if (matchingPeer) {
        setRecipientPeerId(matchingPeer.peer_id);
      }
      return;
    }

    const firstPeer = fiberNode.peers[0];
    setRecipientPeerId(firstPeer.peer_id);
    if (firstPeer.pubkey) {
      setRecipientPubkey(firstPeer.pubkey);
    }
  }, [fiberNode.isConnected, fiberNode.peers, recipientPeerId, recipientPubkey, recipientMode]);

  // For payment history, we need to track payments
  const payment = useStreamingPayment({
    rpcUrl,
    recipientPubkey,
    ratePerSecond: DEMO_EPISODE.pricePerSecond,
    paymentIntervalMs: 1000,
  });

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.header
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-fiber-accent/20 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-fiber-accent"
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
                className="absolute inset-0 rounded-lg bg-fiber-accent/30"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <span className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
              Fiber Audio
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-light mb-4">
            <span className="text-gradient">Stream</span>
            <span className="text-white/90">. Listen. </span>
            <span className="text-gradient">Pay</span>
            <span className="text-white/90">.</span>
          </h1>

          <p className="text-fiber-muted max-w-xl mx-auto">
            Experience the future of content monetization. Pay only for what you listen to,
            streamed in real-time through Fiber Network.
          </p>
        </motion.header>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Player - takes 2 columns */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <AudioPlayer
              episode={DEMO_EPISODE}
              isFiberConnected={fiberNode.isConnected}
              isRouteReady={fiberNode.channelStatus === 'ready'}
              payment={payment}
            />
          </motion.div>

          {/* Sidebar */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {/* Node Status */}
            <div className="relative z-30">
              <NodeStatus
                isConnected={fiberNode.isConnected}
                isConnecting={fiberNode.isConnecting}
                nodeInfo={fiberNode.nodeInfo}
                error={fiberNode.error}
                onConnect={fiberNode.connect}
                onDisconnect={fiberNode.disconnect}
                channelStatus={fiberNode.channelStatus}
                channelError={fiberNode.channelError}
                channelStateName={fiberNode.channelStateName}
                channelElapsed={fiberNode.channelElapsed}
                availableBalance={fiberNode.availableBalance}
                onCheckRoute={() => fiberNode.checkPaymentRoute(recipientPubkey)}
                onOpenChannel={() => fiberNode.setupChannel(recipientPubkey)}
                onCancelSetup={fiberNode.cancelChannelSetup}
                topConfigPanel={
                  !fiberNode.isConnected ? (
                    <div>
                      <label className="block text-xs text-fiber-muted mb-2 font-mono uppercase tracking-wider">
                        Fiber RPC URL
                      </label>
                      <input
                        type="text"
                        value={rpcUrl}
                        onChange={(e) => setRpcUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                        placeholder="http://127.0.0.1:8229"
                      />
                    </div>
                  ) : null
                }
                configPanel={
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <label className="text-xs text-fiber-muted font-mono uppercase tracking-wider">
                          Recipient
                        </label>

                        <div className="inline-flex p-0.5 rounded-lg bg-fiber-dark/70 border border-fiber-border">
                          <button
                            onClick={() => handleRecipientModeChange('peer')}
                            className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider rounded-md transition-colors ${
                              recipientMode === 'peer'
                                ? 'bg-fiber-accent/20 text-fiber-accent border border-fiber-accent/40'
                                : 'text-fiber-muted hover:text-white'
                            }`}
                          >
                            Peer
                          </button>
                          <button
                            onClick={() => handleRecipientModeChange('manual')}
                            className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider rounded-md transition-colors ${
                              recipientMode === 'manual'
                                ? 'bg-fiber-accent/20 text-fiber-accent border border-fiber-accent/40'
                                : 'text-fiber-muted hover:text-white'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>

                      {recipientMode === 'peer' ? (
                        fiberNode.isConnected && fiberNode.peers.length > 0 ? (
                          <div className="space-y-2">
                            <PeerSelector
                              peers={fiberNode.peers}
                              selectedPeerId={recipientPeerId}
                              onSelect={handlePeerSelect}
                            />
                            <p className="text-[10px] text-fiber-muted/80">
                              Select a connected peer to set the payment recipient.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-fiber-warning">
                            No connected peers found. Switch to Manual and connect using recipient multiaddr.
                          </p>
                        )
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-[10px] text-fiber-muted font-mono uppercase tracking-wider">
                            Connect to recipient by multiaddr
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={peerAddress}
                              onChange={(e) => setPeerAddress(e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                              placeholder="/ip4/127.0.0.1/tcp/8228/p2p/Qm..."
                              disabled={fiberNode.isConnectingPeer || !fiberNode.isConnected}
                            />
                            <button
                              onClick={async () => {
                                if (!peerAddress.trim()) return;
                                const peer = await fiberNode.connectToPeer(peerAddress.trim());
                                if (peer) {
                                  setPeerAddress('');
                                  setRecipientMode('manual');
                                  setRecipientPeerId(peer.peer_id);
                                  if (peer.pubkey) {
                                    setRecipientPubkey(peer.pubkey);
                                  }
                                }
                              }}
                              disabled={fiberNode.isConnectingPeer || !peerAddress.trim() || !fiberNode.isConnected}
                              className="px-4 py-2 bg-fiber-accent/20 text-fiber-accent border border-fiber-accent/30 rounded-lg text-sm font-mono hover:bg-fiber-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {fiberNode.isConnectingPeer ? 'Connecting...' : 'Connect'}
                            </button>
                          </div>
                          {!fiberNode.isConnected && (
                            <p className="text-[10px] text-fiber-warning">
                              Connect Fiber node first to connect recipient peer.
                            </p>
                          )}
                          {fiberNode.isConnected && activeRecipientPeer && (
                            <p className="text-[10px] text-fiber-muted/80">
                              Connected recipient: {truncateId(activeRecipientPeer.peer_id, 12, 6)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {fiberNode.connectPeerError && (
                      <p className="text-[10px] text-red-400 mt-1">
                        {fiberNode.connectPeerError}
                      </p>
                    )}

                    <p className="text-[10px] text-fiber-muted/60">
                      Configure node and recipient here, then use Check Route below before starting playback.
                    </p>
                  </div>
                }
              />
            </div>

            {/* Payment History */}
            <div className="relative z-10">
              <PaymentHistory payments={payment.paymentHistory} />
            </div>

          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="inline-flex items-center gap-6 text-xs text-fiber-muted">
            <span>Powered by Fiber Network</span>
            <span className="w-1 h-1 rounded-full bg-fiber-border" />
            <span>Built on CKB</span>
            <span className="w-1 h-1 rounded-full bg-fiber-border" />
            <a
              href="https://github.com/retricsu/fiber-audio-player"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fiber-accent transition-colors"
            >
              GitHub
            </a>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}

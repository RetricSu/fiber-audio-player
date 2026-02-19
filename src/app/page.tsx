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
const DEFAULT_RPC_URL = 'http://127.0.0.1:28227';
const DEFAULT_RECIPIENT_PUBKEY = '0291a6576bd5a94bd74b27080a48340875338fff9f6d6361fe6b8db8d0d1912fcc';

export default function Home() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [recipientPubkey, setRecipientPubkey] = useState(DEFAULT_RECIPIENT_PUBKEY);
  const [recipientPeerId, setRecipientPeerId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [peerAddress, setPeerAddress] = useState('');

  const fiberNode = useFiberNode(rpcUrl);

  // When user selects a peer from PeerSelector, update both peer_id and pubkey
  const handlePeerSelect = (peerId: string) => {
    setRecipientPeerId(peerId);
    const peer = fiberNode.peers.find((p) => p.peer_id === peerId);
    if (peer?.pubkey) {
      setRecipientPubkey(peer.pubkey);
    }
  };

  // Auto-select first peer if connected and no peer selected
  useEffect(() => {
    if (fiberNode.isConnected && fiberNode.peers.length > 0 && !recipientPeerId) {
      const firstPeer = fiberNode.peers[0];
      setRecipientPeerId(firstPeer.peer_id);
      if (firstPeer.pubkey) {
        setRecipientPubkey(firstPeer.pubkey);
      }
    }
  }, [fiberNode.isConnected, fiberNode.peers, recipientPeerId]);

  // For payment history, we need to track payments
  const payment = useStreamingPayment({
    rpcUrl,
    recipientPubkey,
    ratePerSecond: DEMO_EPISODE.pricePerSecond,
    paymentIntervalMs: 5000,
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
              rpcUrl={rpcUrl}
              recipientPubkey={recipientPubkey}
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
              onOpenChannel={() => fiberNode.setupChannel(recipientPeerId)}
              onCancelSetup={fiberNode.cancelChannelSetup}
            />

            {/* Payment History */}
            <PaymentHistory payments={payment.paymentHistory} />

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full p-4 rounded-2xl bg-fiber-surface/50 backdrop-blur-sm border border-fiber-border hover:border-fiber-accent/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
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
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span className="text-sm font-mono text-fiber-muted">Settings</span>
                </div>
                <motion.svg
                  className="w-4 h-4 text-fiber-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  animate={{ rotate: showSettings ? 180 : 0 }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </motion.svg>
              </div>
            </button>

            {/* Settings panel */}
            <motion.div
              initial={false}
              animate={{
                height: showSettings ? 'auto' : 0,
                opacity: showSettings ? 1 : 0,
              }}
              className="overflow-hidden"
            >
              <div className="p-5 rounded-2xl bg-fiber-surface/50 backdrop-blur-sm border border-fiber-border space-y-4">
                {/* RPC URL */}
                <div>
                  <label className="block text-xs text-fiber-muted mb-2 font-mono uppercase tracking-wider">
                    Fiber RPC URL
                  </label>
                  <input
                    type="text"
                    value={rpcUrl}
                    onChange={(e) => setRpcUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                    placeholder="http://127.0.0.1:8227"
                  />
                </div>

                {/* Recipient peer selector */}
                {fiberNode.isConnected && fiberNode.peers.length > 0 ? (
                  <PeerSelector
                    peers={fiberNode.peers}
                    selectedPeerId={recipientPeerId}
                    onSelect={handlePeerSelect}
                  />
                ) : (
                  <div>
                    <label className="block text-xs text-fiber-muted mb-2 font-mono uppercase tracking-wider">
                      Recipient Public Key
                    </label>
                    <input
                      type="text"
                      value={recipientPubkey}
                      onChange={(e) => setRecipientPubkey(e.target.value)}
                      className="w-full px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                      placeholder="03..."
                    />
                    {fiberNode.isConnected && fiberNode.peers.length === 0 && (
                      <p className="text-[10px] text-fiber-warning mt-1">
                        No peers connected. Connect to peers first.
                      </p>
                    )}
                  </div>
                )}

                {/* Connect to new peer */}
                {fiberNode.isConnected && (
                  <div>
                    <label className="block text-xs text-fiber-muted mb-2 font-mono uppercase tracking-wider">
                      Connect to Peer
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={peerAddress}
                        onChange={(e) => setPeerAddress(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 bg-fiber-dark border border-fiber-border rounded-lg text-sm font-mono text-white focus:outline-none focus:border-fiber-accent/50 transition-colors"
                        placeholder="/ip4/127.0.0.1/tcp/8228/p2p/Qm..."
                        disabled={fiberNode.isConnectingPeer}
                      />
                      <button
                        onClick={async () => {
                          if (!peerAddress.trim()) return;
                          const peer = await fiberNode.connectToPeer(peerAddress.trim());
                          if (peer) {
                            setPeerAddress('');
                            handlePeerSelect(peer.peer_id);
                          }
                        }}
                        disabled={fiberNode.isConnectingPeer || !peerAddress.trim()}
                        className="px-4 py-2 bg-fiber-accent/20 text-fiber-accent border border-fiber-accent/30 rounded-lg text-sm font-mono hover:bg-fiber-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {fiberNode.isConnectingPeer ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                    {fiberNode.connectPeerError && (
                      <p className="text-[10px] text-red-400 mt-1">
                        {fiberNode.connectPeerError}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-fiber-muted/60">
                  Connect to your local Fiber node to enable real-time streaming payments.
                </p>
              </div>
            </motion.div>
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
              href="https://github.com/nervosnetwork/fiber"
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

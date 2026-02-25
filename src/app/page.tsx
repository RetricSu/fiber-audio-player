'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NodeStatus } from '@/components/NodeStatus';
import { PaymentHistory } from '@/components/PaymentHistory';
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

// Recipient pubkey is fixed at deploy time by the podcast owner
const RECIPIENT_PUBKEY = process.env.NEXT_PUBLIC_RECIPIENT_PUBKEY || '';

export default function Home() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);

  const fiberNode = useFiberNode(rpcUrl);

  // For payment history, we need to track payments
  const payment = useStreamingPayment({
    rpcUrl,
    recipientPubkey: RECIPIENT_PUBKEY,
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
                recipientPubkey={RECIPIENT_PUBKEY}
                onCheckRoute={() => fiberNode.checkPaymentRoute(RECIPIENT_PUBKEY)}
                onOpenChannel={() => fiberNode.setupChannel(RECIPIENT_PUBKEY)}
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

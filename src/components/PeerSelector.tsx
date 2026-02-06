'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PeerInfo } from '@/lib/fiber-rpc';

interface PeerSelectorProps {
  peers: PeerInfo[];
  selectedPubkey: string;
  onSelect: (pubkey: string) => void;
  disabled?: boolean;
}

export function PeerSelector({ peers, selectedPubkey, onSelect, disabled }: PeerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedPeer = peers.find((p) => p.pubkey === selectedPubkey);

  const truncatePubkey = (pubkey: string) => {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
  };

  const truncatePeerId = (peerId: string) => {
    return `${peerId.slice(0, 12)}...`;
  };

  return (
    <div className="relative">
      <label className="block text-xs text-fiber-muted mb-2 font-mono uppercase tracking-wider">
        Recipient Peer
      </label>

      {/* Selected peer button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2.5 bg-fiber-dark border border-fiber-border rounded-lg text-left transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-fiber-accent/50 cursor-pointer'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            {selectedPeer ? (
              <>
                <p className="text-sm font-mono text-white truncate">
                  {truncatePubkey(selectedPeer.pubkey)}
                </p>
                <p className="text-[10px] text-fiber-muted truncate">
                  {truncatePeerId(selectedPeer.peer_id)}
                </p>
              </>
            ) : (
              <p className="text-sm text-fiber-muted">Select a peer...</p>
            )}
          </div>
          <motion.svg
            className="w-4 h-4 text-fiber-muted ml-2 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            animate={{ rotate: isOpen ? 180 : 0 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 bg-fiber-surface border border-fiber-border rounded-lg shadow-xl overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto">
              {peers.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-fiber-muted">
                  No peers connected
                </div>
              ) : (
                peers.map((peer) => (
                  <button
                    key={peer.pubkey}
                    onClick={() => {
                      onSelect(peer.pubkey);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-fiber-accent/10 ${
                      peer.pubkey === selectedPubkey ? 'bg-fiber-accent/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          peer.pubkey === selectedPubkey ? 'bg-fiber-accent' : 'bg-fiber-muted'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-white truncate">
                          {truncatePubkey(peer.pubkey)}
                        </p>
                        <p className="text-[10px] text-fiber-muted truncate">
                          {truncatePeerId(peer.peer_id)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}

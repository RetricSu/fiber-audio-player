'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PeerInfo } from '@/lib/fiber-rpc';

interface PeerSelectorProps {
  peers: PeerInfo[];
  selectedPeerId: string;
  onSelect: (peerId: string) => void;
  disabled?: boolean;
}

export function PeerSelector({ peers, selectedPeerId, onSelect, disabled }: PeerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedPeer = peers.find((p) => p.peer_id === selectedPeerId);

  const truncateId = (id: string, prefixLen = 8, suffixLen = 6) => {
    if (id.length <= prefixLen + suffixLen + 3) return id;
    return `${id.slice(0, prefixLen)}...${id.slice(-suffixLen)}`;
  };

  const displayLabel = (peer: PeerInfo) => {
    if (peer.pubkey) return truncateId(peer.pubkey);
    return truncateId(peer.peer_id, 12, 4);
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
                  {displayLabel(selectedPeer)}
                </p>
                <p className="text-[10px] text-fiber-muted truncate">
                  {truncateId(selectedPeer.peer_id, 12, 4)}
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
                    key={peer.peer_id}
                    onClick={() => {
                      onSelect(peer.peer_id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-fiber-accent/10 ${
                      peer.peer_id === selectedPeerId ? 'bg-fiber-accent/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          peer.peer_id === selectedPeerId ? 'bg-fiber-accent' : 'bg-fiber-muted'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-white truncate">
                          {displayLabel(peer)}
                        </p>
                        <p className="text-[10px] text-fiber-muted truncate">
                          {truncateId(peer.peer_id, 12, 4)}
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

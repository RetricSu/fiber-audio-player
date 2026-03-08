'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Episode, EpisodeCard } from './EpisodeCard';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:8787';

interface EpisodeListProps {
  podcastId: string;
  onEpisodeSelect: (episode: Episode) => void;
  selectedEpisodeId?: string;
}

export function EpisodeList({ podcastId, onEpisodeSelect, selectedEpisodeId }: EpisodeListProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEpisodes() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BACKEND_URL}/api/podcasts/${podcastId}/episodes`);

        if (!response.ok) {
          throw new Error(`Failed to fetch episodes: ${response.status}`);
        }

        const data = await response.json();

        if (!data.ok || !Array.isArray(data.episodes)) {
          throw new Error('Invalid response format');
        }

        setEpisodes(data.episodes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load episodes');
      } finally {
        setLoading(false);
      }
    }

    fetchEpisodes();
  }, [podcastId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center gap-3 text-fiber-muted">
          <motion.div
            className="w-5 h-5 border-2 border-fiber-accent border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <span className="text-sm font-mono">Loading episodes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
        >
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-mono">{error}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-fiber-surface border border-fiber-border mb-4">
          <svg className="w-8 h-8 text-fiber-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>
        <p className="text-fiber-muted font-mono text-sm">No episodes available</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-3 p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
          Episodes ({episodes.length})
        </h2>
      </div>

      <div className="space-y-3">
        {episodes.map((episode, index) => (
          <motion.div
            key={episode.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <EpisodeCard
              episode={episode}
              onClick={() => onEpisodeSelect(episode)}
              isSelected={episode.id === selectedEpisodeId}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

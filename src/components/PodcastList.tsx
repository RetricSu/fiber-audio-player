'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:8787';

export interface Podcast {
  id: string;
  title: string;
  description: string | null;
  created_at: number;
}

interface PodcastListProps {
  onPodcastSelect: (podcast: Podcast) => void;
  selectedPodcastId?: string;
}

export function PodcastList({ onPodcastSelect, selectedPodcastId }: PodcastListProps) {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPodcasts() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BACKEND_URL}/api/podcasts`);

        if (!response.ok) {
          throw new Error(`Failed to fetch podcasts: ${response.status}`);
        }

        const data = await response.json();

        if (!data.ok || !Array.isArray(data.podcasts)) {
          throw new Error('Invalid response format');
        }

        setPodcasts(data.podcasts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load podcasts');
      } finally {
        setLoading(false);
      }
    }

    fetchPodcasts();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center gap-3 text-fiber-muted">
          <motion.div
            className="w-5 h-5 border-2 border-fiber-accent border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <span className="text-sm font-mono">Loading podcasts...</span>
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

  if (podcasts.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-fiber-surface border border-fiber-border mb-4">
          <svg className="w-8 h-8 text-fiber-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
        <p className="text-fiber-muted font-mono text-sm">No podcasts available</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-wider text-fiber-muted">
          Podcasts ({podcasts.length})
        </h2>
      </div>

      <div className="space-y-2">
        {podcasts.map((podcast, index) => (
          <motion.button
            key={podcast.id}
            onClick={() => onPodcastSelect(podcast)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
              w-full text-left p-4 rounded-xl transition-all duration-200
              ${
                selectedPodcastId === podcast.id
                  ? 'bg-fiber-accent/10 border border-fiber-accent'
                  : 'bg-fiber-surface/40 border border-transparent hover:border-fiber-border hover:bg-fiber-surface/60'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                  ${
                    selectedPodcastId === podcast.id
                      ? 'bg-fiber-accent/20 text-fiber-accent'
                      : 'bg-fiber-border/50 text-fiber-muted'
                  }
                `}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3
                  className={`font-semibold truncate ${
                    selectedPodcastId === podcast.id ? 'text-fiber-accent' : 'text-white'
                  }`}
                >
                  {podcast.title}
                </h3>
                {podcast.description && (
                  <p className="text-sm text-fiber-muted line-clamp-1 mt-0.5">
                    {podcast.description}
                  </p>
                )}
              </div>

              {selectedPodcastId === podcast.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-2 h-2 rounded-full bg-fiber-accent flex-shrink-0"
                />
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

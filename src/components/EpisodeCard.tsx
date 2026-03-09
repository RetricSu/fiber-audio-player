'use client';

import { motion } from 'motion/react';

export interface Episode {
  id: string;
  podcast_id: string;
  title: string;
  description: string | null;
  duration: number | null;
  price_per_second: string;
  status: string;
  hls_url: string | null;
  created_at: number;
}

interface EpisodeCardProps {
  episode: Episode;
  onClick: () => void;
  isSelected?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown duration';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

export function EpisodeCard({ episode, onClick, isSelected }: EpisodeCardProps) {
  return (
    <motion.div
      onClick={onClick}
      className={`
        relative p-4 rounded-xl cursor-pointer
        border transition-all duration-300
        ${
          isSelected
            ? 'bg-fiber-accent/10 border-fiber-accent shadow-lg shadow-fiber-accent/20'
            : 'bg-fiber-surface/60 border-fiber-border hover:border-fiber-accent/50 hover:bg-fiber-surface/80'
        }
      `}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {isSelected && (
        <motion.div
          className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-12 bg-fiber-accent rounded-full"
          layoutId="selectionIndicator"
        />
      )}

      <h3
        className={`text-lg font-semibold mb-2 line-clamp-1 ${
          isSelected ? 'text-fiber-accent' : 'text-white'
        }`}
      >
        {episode.title}
      </h3>

      {episode.description && (
        <p className="text-sm text-fiber-muted line-clamp-2 mb-3">
          {episode.description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1 text-fiber-muted">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formatDuration(episode.duration)}
          </span>

          <span className="flex items-center gap-1 text-fiber-accent">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              />
            </svg>
            {episode.price_per_second} shannon/sec
          </span>
        </div>

        <span
          className={`
            text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full
            ${
              episode.status === 'published'
                ? 'bg-fiber-accent/20 text-fiber-accent'
                : episode.status === 'processing'
                ? 'bg-fiber-warning/20 text-fiber-warning'
                : 'bg-fiber-muted/20 text-fiber-muted'
            }
          `}
        >
          {episode.status}
        </span>
      </div>

      <motion.div
        className="absolute inset-0 rounded-xl bg-gradient-to-r from-fiber-accent/5 to-fiber-flow/5 pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
}

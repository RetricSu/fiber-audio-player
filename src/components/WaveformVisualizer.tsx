'use client';

import { motion } from 'motion/react';
import { useMemo } from 'react';

interface WaveformVisualizerProps {
  isPlaying: boolean;
  progress: number; // 0-1
  onSeek?: (progress: number) => void;
}

export function WaveformVisualizer({
  isPlaying,
  progress,
  onSeek,
}: WaveformVisualizerProps) {
  // Generate pseudo-random waveform bars
  const bars = useMemo(() => {
    const count = 80;
    return Array.from({ length: count }, (_, i) => {
      const x = i / count;
      // Create a more organic waveform shape
      const base = Math.sin(x * Math.PI) * 0.7;
      const noise = Math.sin(x * 47) * 0.2 + Math.cos(x * 23) * 0.1;
      return Math.max(0.15, Math.min(1, base + noise + 0.3));
    });
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, x)));
  };

  return (
    <div
      className="relative h-20 cursor-pointer group"
      onClick={handleClick}
    >
      {/* Glow effect behind waveform */}
      <div
        className="absolute inset-0 blur-xl opacity-30"
        style={{
          background: `linear-gradient(90deg,
            transparent ${progress * 100 - 5}%,
            var(--color-fiber-accent) ${progress * 100}%,
            transparent ${progress * 100 + 5}%)`,
        }}
      />

      {/* Waveform container */}
      <div className="relative h-full flex items-center gap-[2px]">
        {bars.map((height, i) => {
          const barProgress = i / bars.length;
          const isPast = barProgress < progress;
          const isAtPlayhead = Math.abs(barProgress - progress) < 0.02;

          return (
            <motion.div
              key={i}
              className="flex-1 rounded-full transition-colors duration-150"
              style={{
                height: `${height * 100}%`,
                backgroundColor: isPast
                  ? 'var(--color-fiber-accent)'
                  : 'var(--color-fiber-border)',
                opacity: isPast ? 1 : 0.6,
              }}
              animate={
                isPlaying && isAtPlayhead
                  ? {
                      scaleY: [1, 1.2, 1],
                    }
                  : {}
              }
              transition={{
                duration: 0.3,
                ease: 'easeInOut',
              }}
              whileHover={{
                scaleY: 1.3,
                backgroundColor: 'var(--color-fiber-flow)',
              }}
            />
          );
        })}
      </div>

      {/* Playhead */}
      <motion.div
        className="absolute top-0 bottom-0 w-0.5 bg-fiber-accent"
        style={{ left: `${progress * 100}%` }}
        animate={isPlaying ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        {/* Playhead glow */}
        <div className="absolute -inset-x-2 inset-y-0 bg-fiber-accent/30 blur-sm" />
      </motion.div>

      {/* Hover time indicator */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full pb-2">
          <div className="bg-fiber-surface/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono text-fiber-muted border border-fiber-border">
            Click to seek
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { UseStreamingPaymentResult } from '@/hooks/use-streaming-payment';
import { WaveformVisualizer } from './WaveformVisualizer';
import { PaymentFlowVisualizer } from './PaymentFlowVisualizer';

interface Episode {
  id: string;
  title: string;
  artist: string;
  description: string;
  duration: string;
  audioUrl: string;
  coverUrl: string;
  pricePerSecond: number; // CKB per second
}

interface AudioPlayerProps {
  episode: Episode;
  isFiberConnected: boolean;
  isRouteReady: boolean;
  payment: UseStreamingPaymentResult;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({
  episode,
  isFiberConnected,
  isRouteReady,
  payment,
}: AudioPlayerProps) {
  const [volume, setVolumeState] = useState(0.8);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackGuardError, setPlaybackGuardError] = useState<string | null>(null);
  const wasPlayingRef = useRef(false);

  const audio = useAudioPlayer(episode.audioUrl);

  // Ensure payment stream is stopped when playback actually transitions from playing to stopped.
  // This avoids stopping during startup while waiting for the audio play event.
  useEffect(() => {
    if (wasPlayingRef.current && !audio.isPlaying && payment.isStreaming) {
      payment.stop();
    }
    wasPlayingRef.current = audio.isPlaying;
  }, [audio.isPlaying, payment.isStreaming, payment]);

  // Stop playback if payment stream fails while playing
  useEffect(() => {
    if (audio.isPlaying && payment.error) {
      audio.pause();
      payment.stop();
      setPlaybackGuardError(payment.error);
    }
  }, [audio, payment]);

  const handlePlayPause = useCallback(async () => {
    if (audio.isPlaying) {
      audio.pause();
      await payment.stop();
    } else {
      if (!isFiberConnected) {
        setPlaybackGuardError('Fiber node is not connected. Connect your node before playing.');
        return;
      }

      if (!isRouteReady) {
        setPlaybackGuardError('No payment route available. Click "Check Route" before playing.');
        return;
      }

      setPlaybackGuardError(null);

      const started = await payment.start();
      if (!started) {
        setPlaybackGuardError(payment.error || 'Unable to start payment stream.');
        return;
      }

      await audio.play();
    }
  }, [audio, isFiberConnected, isRouteReady, payment]);

  const handleSeek = useCallback(
    (progress: number) => {
      const time = progress * audio.duration;
      audio.seek(time);
    },
    [audio]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolumeState(newVolume);
      audio.setVolume(newVolume);
    },
    [audio]
  );

  const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
  const canStartPlayback = isFiberConnected && isRouteReady;
  const isPlayButtonDisabled = audio.isLoading || (!audio.isPlaying && !canStartPlayback);

  return (
    <div className="relative">
      {/* Main player card */}
      <motion.div
        className="relative overflow-hidden rounded-3xl bg-fiber-surface/80 backdrop-blur-xl border border-fiber-border shadow-2xl shadow-black/50"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Ambient glow */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-fiber-accent/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-fiber-flow/20 rounded-full blur-3xl opacity-50" />

        <div className="relative z-10 p-6 sm:p-8">
          {/* Episode info section */}
          <div className="flex flex-col sm:flex-row gap-6 mb-8">
            {/* Cover art */}
            <motion.div
              className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden flex-shrink-0 mx-auto sm:mx-0"
              animate={audio.isPlaying ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-fiber-accent/30 to-fiber-flow/30" />
              <img
                src={episode.coverUrl}
                alt={episode.title}
                className="w-full h-full object-cover"
              />

              {/* Playing indicator overlay */}
              <AnimatePresence>
                {audio.isPlaying && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-end gap-1 h-8">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1 bg-fiber-accent rounded-full"
                          animate={{
                            height: ['30%', '100%', '30%'],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            delay: i * 0.15,
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Episode details */}
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-mono uppercase tracking-wider text-fiber-accent mb-2">
                Now Playing
              </p>
              <h2 className="text-2xl sm:text-3xl font-display font-light text-white mb-2 leading-tight">
                {episode.title}
              </h2>
              <p className="text-fiber-muted mb-4">{episode.artist}</p>
              <p className="text-sm text-fiber-muted/70 line-clamp-2 hidden sm:block">
                {episode.description}
              </p>

              {/* Price badge */}
              <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-fiber-accent/10 border border-fiber-accent/30">
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
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  />
                </svg>
                <span className="text-xs font-mono text-fiber-accent">
                  {episode.pricePerSecond} CKB/sec
                </span>
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div className="mb-6">
            <WaveformVisualizer
              isPlaying={audio.isPlaying}
              progress={progress}
              onSeek={handleSeek}
            />
          </div>

          {/* Time display */}
          <div className="flex justify-between text-xs font-mono text-fiber-muted mb-6">
            <span>{formatTime(audio.currentTime)}</span>
            <span>{formatTime(audio.duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6">
            {/* Skip back */}
            <button
              onClick={() => audio.seek(Math.max(0, audio.currentTime - 15))}
              className="p-2 text-fiber-muted hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
                />
              </svg>
            </button>

            {/* Play/Pause */}
            <motion.button
              onClick={handlePlayPause}
              className="relative w-16 h-16 rounded-full bg-fiber-accent flex items-center justify-center shadow-lg shadow-fiber-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={isPlayButtonDisabled ? undefined : { scale: 1.05 }}
              whileTap={isPlayButtonDisabled ? undefined : { scale: 0.95 }}
              disabled={isPlayButtonDisabled}
              title={
                !isFiberConnected
                  ? 'Connect Fiber node first'
                  : !isRouteReady
                  ? 'Check route before playing'
                  : undefined
              }
            >
              {audio.isLoading ? (
                <motion.div
                  className="w-6 h-6 border-2 border-fiber-dark border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : audio.isPlaying ? (
                <svg className="w-7 h-7 text-fiber-dark" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-fiber-dark ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}

              {/* Ripple effect when playing */}
              {audio.isPlaying && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-fiber-accent"
                  animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>

            {/* Skip forward */}
            <button
              onClick={() => audio.seek(Math.min(audio.duration, audio.currentTime + 30))}
              className="p-2 text-fiber-muted hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
                />
              </svg>
            </button>

            {/* Volume */}
            <div className="relative">
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="p-2 text-fiber-muted hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {volume === 0 ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  )}
                </svg>
              </button>

              <AnimatePresence>
                {showVolumeSlider && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-fiber-surface border border-fiber-border rounded-xl"
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-24 h-1 appearance-none bg-fiber-border rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fiber-accent"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Payment flow visualizer */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <PaymentFlowVisualizer
          isActive={payment.isStreaming}
          lastPayment={payment.lastPayment}
          totalPaid={payment.totalPaid}
        />
      </motion.div>

      {/* Payment error */}
      <AnimatePresence>
        {(playbackGuardError || payment.error) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30"
          >
            <p className="text-sm text-red-400 font-mono">{playbackGuardError || payment.error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

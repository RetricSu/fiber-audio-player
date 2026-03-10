'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { UseStreamingPaymentResult } from '@/hooks/use-streaming-payment';
import { WaveformVisualizer } from './WaveformVisualizer';
import { PaymentFlowVisualizer } from './PaymentFlowVisualizer';
import { PaymentLoading } from './PaymentLoading';
import {
  setPaymentLock,
  isPaymentLocked,
  clearPaymentLock,
  getLockRemainingText,
} from '@/lib/payment-lock';
import { createSession } from '@/lib/stream-auth';

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
  const chunkSeconds = Math.max(
    1,
    Number(process.env.NEXT_PUBLIC_STREAM_CHUNK_SECONDS ?? 30)
  );
  const [volume, setVolumeState] = useState(0.8);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackGuardError, setPlaybackGuardError] = useState<string | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState(episode.audioUrl);
  const [paymentLockText, setPaymentLockText] = useState<string | null>(null);
  const [showPaymentLoading, setShowPaymentLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState<1 | 2 | 3>(1);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'checking' | 'pending' | 'completed' | 'failed'>('idle');
  const wasPlayingRef = useRef(false);
  const shouldAutoPlayAfterAuthorizeRef = useRef(false);

  const audio = useAudioPlayer(playbackSrc);

  // Auto-extend: when playback approaches the paid segment boundary, pay for more
  const isExtendingRef = useRef(false);

  // Poll for payment lock status to update UI
  useEffect(() => {
    if (audio.isPlaying || !episode.id) {
      setPaymentLockText(null);
      return;
    }

    const checkLock = () => {
      if (isPaymentLocked(episode.id)) {
        const remaining = getLockRemainingText(episode.id);
        setPaymentLockText(remaining ? `支付进行中... (${remaining})` : '支付进行中...');
      } else {
        setPaymentLockText(null);
      }
    };

    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [audio.isPlaying, episode.id]);

  useEffect(() => {
    if (
      !audio.isPlaying ||
      !payment.isStreaming ||
      !payment.currentGrant ||
      isExtendingRef.current
    ) {
      return;
    }

    const segmentDuration = payment.currentGrant.segmentDurationSec;
    // Use granted segment boundary rather than raw seconds so frontend and
    // backend authorization stay aligned.
    const paidUpTo = (payment.currentGrant.maxSegmentIndex + 1) * segmentDuration;
    // Start extending when we're within 2 segments of the boundary
    const threshold = paidUpTo - segmentDuration * 2;

    if (audio.currentTime >= threshold && threshold > 0) {
      isExtendingRef.current = true;
      payment.extend(chunkSeconds)
        .catch(() => { /* error is surfaced via payment.error */ })
        .finally(() => { isExtendingRef.current = false; });
    }
  }, [audio.currentTime, audio.isPlaying, payment, chunkSeconds]);

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

  useEffect(() => {
    if (!shouldAutoPlayAfterAuthorizeRef.current) {
      return;
    }

    shouldAutoPlayAfterAuthorizeRef.current = false;
    audio.play().catch(() => {
      setPlaybackGuardError('Playback failed after authorization.');
    });
  }, [audio, playbackSrc]);

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

      // Check for existing payment lock (prevents duplicate clicks)
      if (isPaymentLocked(episode.id)) {
        const remaining = getLockRemainingText(episode.id);
        setPlaybackGuardError(remaining ? `支付进行中，请等待 ${remaining}...` : '支付进行中，请稍候...');
        return;
      }

      setPlaybackGuardError(null);

      setPaymentLock(episode.id);

      setPaymentStep(1);
      setShowPaymentLoading(true);

      const step2Timeout = setTimeout(() => setPaymentStep(2), 800);
      const step3Timeout = setTimeout(() => setPaymentStep(3), 2000);

      try {
        const grant = await payment.start(episode.id, chunkSeconds);

        clearTimeout(step2Timeout);
        clearTimeout(step3Timeout);
        setShowPaymentLoading(false);

        if (!grant) {
          clearPaymentLock(episode.id);
          setPlaybackGuardError(payment.error || 'Unable to start payment stream.');
          return;
        }

        clearPaymentLock(episode.id);
        shouldAutoPlayAfterAuthorizeRef.current = true;
        setPlaybackSrc(grant.playlistUrl);
      } catch (error) {
        clearTimeout(step2Timeout);
        clearTimeout(step3Timeout);
        setShowPaymentLoading(false);

        clearPaymentLock(episode.id);
        await payment.stop();

        const errorMessage = error instanceof Error ? error.message : 'Failed to authorize stream playback.';

        if (errorMessage === '请求超时，请稍后重试或查询状态') {
          setTimeoutError(errorMessage);
          setPaymentStatus('idle');
        } else {
          setPlaybackGuardError(errorMessage);
        }
      }
    }
  }, [audio, isFiberConnected, isRouteReady, payment, chunkSeconds]);

  const handleSeek = useCallback(
    (progress: number) => {
      const time = progress * audio.duration;
      audio.seek(time);
    },
    [audio]
  );

  const handleCheckStatus = useCallback(async () => {
    setPaymentStatus('checking');

    await new Promise((resolve) => setTimeout(resolve, 1500));

    setPaymentStatus('pending');
  }, []);

  const handleDismissTimeout = useCallback(() => {
    setTimeoutError(null);
    setPaymentStatus('idle');
  }, []);

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
  const isPaymentLockedState = Boolean(episode.id && isPaymentLocked(episode.id));
  const isPlayButtonDisabled = audio.isLoading || (!audio.isPlaying && !canStartPlayback) || isPaymentLockedState;

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
              <p className="text-sm text-white/90 line-clamp-2 hidden sm:block">
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
            <div className="relative group">
              <motion.button
                onClick={handlePlayPause}
                className="relative w-16 h-16 rounded-full bg-fiber-accent flex items-center justify-center shadow-lg shadow-fiber-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={isPlayButtonDisabled ? undefined : { scale: 1.05 }}
                whileTap={isPlayButtonDisabled ? undefined : { scale: 0.95 }}
                disabled={isPlayButtonDisabled}
                title={
                  isPaymentLockedState
                    ? paymentLockText || '支付进行中...'
                    : !isFiberConnected
                    ? 'Connect Fiber node first'
                    : !isRouteReady
                    ? 'Check route before playing'
                    : undefined
                }
              >
                {isPaymentLockedState ? (
                  <motion.div
                    className="w-6 h-6 border-2 border-fiber-dark border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                ) : audio.isLoading ? (
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

              {isPlayButtonDisabled && !isPaymentLockedState && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-fiber-surface border border-fiber-border text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                  Connect Fiber node and check route first
                </div>
              )}

              {/* Payment lock indicator */}
              <AnimatePresence>
                {isPaymentLockedState && paymentLockText && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-3 py-1.5 rounded-full bg-fiber-accent/10 border border-fiber-accent/30 whitespace-nowrap"
                  >
                    <span className="text-xs font-mono text-fiber-accent">{paymentLockText}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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

      <AnimatePresence>
        {timeoutError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-4 p-5 rounded-xl bg-amber-500/10 border border-amber-500/30"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-300 mb-1">
                  支付处理超时
                </h4>
                <p className="text-sm text-amber-200/80 mb-4">
                  {timeoutError}
                </p>

                {paymentStatus === 'idle' && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleCheckStatus}
                      className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      查询状态
                    </button>
                    <button
                      onClick={handleDismissTimeout}
                      className="px-4 py-2 rounded-lg bg-fiber-surface hover:bg-fiber-surface/80 border border-fiber-border text-fiber-muted text-sm font-medium transition-colors"
                    >
                      关闭
                    </button>
                  </div>
                )}

                {paymentStatus === 'checking' && (
                  <div className="flex items-center gap-3 py-2">
                    <motion.div
                      className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <span className="text-sm text-amber-300">正在查询支付状态...</span>
                  </div>
                )}

                {paymentStatus === 'pending' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-300">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium">支付处理中</span>
                    </div>
                    <p className="text-xs text-amber-200/60">
                      您的支付正在区块链上确认，通常需要 10-60 秒。请刷新页面查看最新状态。
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-sm font-medium transition-colors"
                      >
                        刷新页面
                      </button>
                      <button
                        onClick={handleDismissTimeout}
                        className="px-4 py-2 rounded-lg bg-fiber-surface hover:bg-fiber-surface/80 border border-fiber-border text-fiber-muted text-sm font-medium transition-colors"
                      >
                        稍后再试
                      </button>
                    </div>
                  </div>
                )}

                {paymentStatus === 'completed' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium">支付已完成</span>
                    </div>
                    <p className="text-xs text-amber-200/60">
                      您的支付已成功确认，可以开始播放了。
                    </p>
                    <button
                      onClick={() => {
                        handleDismissTimeout();
                        handlePlayPause();
                      }}
                      className="px-4 py-2 rounded-lg bg-fiber-accent hover:bg-fiber-accent/90 text-fiber-dark text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      立即播放
                    </button>
                  </div>
                )}

                {paymentStatus === 'failed' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium">支付失败</span>
                    </div>
                    <p className="text-xs text-amber-200/60">
                      支付未能成功完成，请检查您的钱包余额和网络连接后重试。
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          handleDismissTimeout();
                          handlePlayPause();
                        }}
                        className="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-sm font-medium transition-colors"
                      >
                        重新支付
                      </button>
                      <button
                        onClick={handleDismissTimeout}
                        className="px-4 py-2 rounded-lg bg-fiber-surface hover:bg-fiber-surface/80 border border-fiber-border text-fiber-muted text-sm font-medium transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentLoading
        isVisible={showPaymentLoading}
        currentStep={paymentStep}
        onCancel={() => {
          setShowPaymentLoading(false);
          // Clear payment lock so user can retry immediately
          clearPaymentLock(episode.id);
        }}
      />
    </div>
  );
}

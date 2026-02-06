'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  playbackRate: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseAudioPlayerResult extends AudioState {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useAudioPlayer(src: string): UseAudioPlayerResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    playbackRate: 1,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: audio.duration, isLoading: false }));
    };

    const handleTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    };

    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        const buffered = audio.buffered.end(audio.buffered.length - 1);
        setState((s) => ({ ...s, buffered }));
      }
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
    };

    const handleError = () => {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: 'Failed to load audio',
      }));
    };

    const handleWaiting = () => {
      setState((s) => ({ ...s, isLoading: true }));
    };

    const handleCanPlay = () => {
      setState((s) => ({ ...s, isLoading: false }));
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('progress', handleProgress);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('progress', handleProgress);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [src]);

  const play = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : 'Playback failed',
        }));
      }
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      setState((s) => ({ ...s, volume }));
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setState((s) => ({ ...s, playbackRate: rate }));
    }
  }, []);

  return {
    ...state,
    play,
    pause,
    seek,
    setVolume,
    setPlaybackRate,
    audioRef,
  };
}

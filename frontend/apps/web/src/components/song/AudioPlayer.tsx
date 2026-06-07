'use client';


import { useCallback, useEffect, useRef } from 'react';
import { useAudio } from '../../context/AudioContext';

interface AudioPlayerProps {
  src: string;
  title?: string;
  autoPlay?: boolean;
  onPlayingChange?: (isPlaying: boolean) => void;
  onDurationChange?: (duration: number) => void;
  songId?: string;
  artistName?: string;
  coverUrl?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function resolveVolumeIconName(volume: number, muted: boolean): string {
  if (muted || volume <= 0) return 'volume_off';
  if (volume < 0.5) return 'volume_down';
  return 'volume_up';
}

export function AudioPlayer({ src, title, autoPlay = false, onPlayingChange, onDurationChange, songId, artistName, coverUrl }: AudioPlayerProps) {
  const { isPlaying, currentTime, duration, volume, muted, playSong, pause, seek, setVolume, setMuted } = useAudio();

  const previousVolumeRef = useRef(0.8);
  const hasInitializedRef = useRef(false);

  // Initialize audio when component mounts and src is available
  useEffect(() => {
    if (!src || hasInitializedRef.current) return;

    playSong({
      id: songId || 'local-player',
      title: title || 'Audio',
      artistName: artistName || '',
      coverUrl: coverUrl || '',
      audioUrl: src
    });

    hasInitializedRef.current = true;

    return () => {
      hasInitializedRef.current = false;
    };
  }, [src, title, songId, artistName, coverUrl, playSong]);

  // Sync playing state with parent
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // Sync duration with parent
  useEffect(() => {
    if (duration > 0) {
      onDurationChange?.(duration);
    }
  }, [duration, onDurationChange]);

  // Handle autoPlay
  useEffect(() => {
    if (!autoPlay || !src) return;
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      playSong({
        id: songId || 'local-player',
        title: title || 'Audio',
        artistName: artistName || '',
        coverUrl: coverUrl || '',
        audioUrl: src
      });
    }
  }, [autoPlay, src, title, songId, artistName, coverUrl, playSong]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      playSong({
        id: songId || 'local-player',
        title: title || 'Audio',
        artistName: artistName || '',
        coverUrl: coverUrl || '',
        audioUrl: src
      });
    }
  }, [isPlaying, pause, playSong, src, title, songId, artistName, coverUrl]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    if (next) {
      previousVolumeRef.current = volume > 0 ? volume : 0.8;
    } else if (volume === 0) {
      setVolume(previousVolumeRef.current || 0.8);
    }
    setMuted(next);
  }, [muted, volume, setVolume]);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
    }
    if (next === 0 && !muted) {
      setMuted(true);
    }
  }, [muted, setVolume, setMuted]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = (Number(event.target.value) / 100) * duration;
    seek(next);
  }, [duration, seek]);

  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const seekPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className="song-audio-player"
      role="group"
      aria-label={title ?? 'Reproductor de audio'}
    >
      {/* Play/Pause button */}
      <button
        type="button"
        className="song-audio-player-btn song-audio-player-btn--play"
        onClick={handleTogglePlay}
        aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
      >
        <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
      </button>

      {/* Time display */}
      <span className="song-audio-player-time" aria-live="off">{formatTime(currentTime)}</span>

      {/* Progress bar */}
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={seekPercent}
        onChange={handleSeek}
        className="song-audio-player-progress"
        aria-label="Posición de reproducción"
        disabled={duration <= 0}
      />

      {/* Volume control */}
      <button
        type="button"
        className="song-audio-player-btn"
        onClick={handleToggleMute}
        aria-label={muted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
      >
        <span className="material-symbols-outlined">{resolveVolumeIconName(volume, muted)}</span>
      </button>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volumePercent}
        onChange={handleVolumeChange}
        className="song-audio-player-volume"
        aria-label="Volumen"
      />
    </div>
  );
}

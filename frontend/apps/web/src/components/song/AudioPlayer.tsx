'use client';


import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  autoPlay?: boolean;
  showMainButton?: boolean;
  onPlayingChange?: (isPlaying: boolean) => void;
  onEnded?: () => void;
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

export function AudioPlayer({ src, title, autoPlay = false, showMainButton = true, onPlayingChange, onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const previousVolumeRef = useRef(0.8);

  // Sync volume/mute to <audio> element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // Reset playback state when src changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    if (!autoPlay) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => {
      setIsPlaying(false);
      onPlayingChange?.(false);
    });
  }, [autoPlay, src, onPlayingChange]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => {
        setIsPlaying(false);
        onPlayingChange?.(false);
      });
    }
  }, [isPlaying, onPlayingChange]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        previousVolumeRef.current = volume > 0 ? volume : 0.8;
      } else if (volume === 0) {
        setVolume(previousVolumeRef.current || 0.8);
      }
      return next;
    });
  }, [volume]);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
    }
    if (next === 0 && !muted) {
      setMuted(true);
    }
  }, [muted]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    const next = (Number(event.target.value) / 100) * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const seekPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={showMainButton ? 'audio-player-wrapper' : 'audio-player-wrapper audio-player-wrapper-embedded'}
      role="group"
      aria-label={title ?? 'Reproductor de audio'}
    >
      {showMainButton ? (
        <button
          type="button"
          className="audio-player-main-btn"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
        >
          <span className="material-symbols-outlined audio-player-main-icon" aria-hidden="true">volume_up</span>
          <span className="audio-player-play-badge" aria-hidden="true">
            {isPlaying ? '❚❚' : '▶'}
          </span>
        </button>
      ) : null}

      <div className="audio-player-panel">
        <div className="audio-player-row">
          <button
            type="button"
            className="audio-player-icon-btn"
            onClick={handleToggleMute}
            aria-label={muted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
          >
            <span className="material-symbols-outlined" aria-hidden="true">{resolveVolumeIconName(volume, muted)}</span>
          </button>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            onChange={handleVolumeChange}
            className="audio-player-range audio-player-range-volume"
            aria-label="Volumen"
            style={{ ['--fill' as string]: `${volumePercent}%` }}
          />
        </div>

        <div className="audio-player-row">
          <span className="audio-player-time" aria-live="off">{formatTime(currentTime)}</span>

          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={seekPercent}
            onChange={handleSeek}
            className="audio-player-range audio-player-range-seek"
            aria-label="Posición de reproducción"
            disabled={duration <= 0}
            style={{ ['--fill' as string]: `${seekPercent}%` }}
          />
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => {
          setIsPlaying(true);
          onPlayingChange?.(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          onPlayingChange?.(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onPlayingChange?.(false);
          onEnded?.();
        }}
      />
    </div>
  );
}

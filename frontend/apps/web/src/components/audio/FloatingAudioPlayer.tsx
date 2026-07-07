'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAudio } from '../../context/AudioContext';
import { useIsMobile } from '../../hooks/useMediaQuery';

const AUDIO_PLAYER_PLACEMENT_KEY = 'canticum:audio-player-placement';
const AUDIO_PLAYER_PLACEMENT_EVENT = 'canticum:audio-player-placement-change';

type AudioPlayerPlacement = 'floating' | 'header';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function readAudioPlayerPlacement(): AudioPlayerPlacement {
  if (typeof window === 'undefined') {
    return 'floating';
  }

  return window.localStorage.getItem(AUDIO_PLAYER_PLACEMENT_KEY) === 'header' ? 'header' : 'floating';
}

export function setAudioPlayerPlacement(placement: AudioPlayerPlacement) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUDIO_PLAYER_PLACEMENT_KEY, placement);
  window.dispatchEvent(new CustomEvent<AudioPlayerPlacement>(AUDIO_PLAYER_PLACEMENT_EVENT, { detail: placement }));
}

export function useAudioPlayerPlacement() {
  const [placement, setPlacement] = useState<AudioPlayerPlacement>('floating');

  useEffect(() => {
    setPlacement(readAudioPlayerPlacement());

    const handlePlacementChange = (event: Event) => {
      setPlacement((event as CustomEvent<AudioPlayerPlacement>).detail ?? readAudioPlayerPlacement());
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === AUDIO_PLAYER_PLACEMENT_KEY) {
        setPlacement(readAudioPlayerPlacement());
      }
    };

    window.addEventListener(AUDIO_PLAYER_PLACEMENT_EVENT, handlePlacementChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener(AUDIO_PLAYER_PLACEMENT_EVENT, handlePlacementChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return placement;
}

interface FloatingAudioPlayerProps {
  placement?: AudioPlayerPlacement;
}

function resolveVolumeIconName(volume: number, muted: boolean): string {
  if (muted || volume <= 0) return 'volume_off';
  if (volume < 0.5) return 'volume_down';
  return 'volume_up';
}

export function FloatingAudioPlayer({ placement = 'floating' }: FloatingAudioPlayerProps) {
  const { activeSong, isPlaying, currentTime, duration, volume, muted, queue, queueSource, queueIndex, playSong, playSongAtIndex, pause, seek, setVolume, setMuted, stopAll } = useAudio();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const previousVolumeRef = useRef(0.8);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  if (!activeSong) {
    return null;
  }

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      playSong(activeSong);
    }
  };

  const handlePrevious = () => {
    if (queueSource && queueIndex > 0) {
      playSongAtIndex(queueIndex - 1);
    }
  };

  const handleNext = () => {
    if (queueSource && queueIndex < queue.length - 1) {
      playSongAtIndex(queueIndex + 1);
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = (Number(event.target.value) / 100) * duration;
    seek(next);
  };

  const handlePlacementChange = () => {
    setAudioPlayerPlacement(placement === 'header' ? 'floating' : 'header');
    setIsMenuOpen(false);
  };

  const handleToggleMute = () => {
    const next = !muted;
    if (next) {
      previousVolumeRef.current = volume > 0 ? volume : 0.8;
    } else if (volume === 0) {
      setVolume(previousVolumeRef.current || 0.8);
    }
    setMuted(next);
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
    }
    if (next === 0 && !muted) {
      setMuted(true);
    }
  };

  const seekPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const hasQueue = queueSource !== null && queue.length > 0;
  const placementLabel = placement === 'header' ? 'Volver flotante' : 'Fijar en header';

  return (
    <div className={`floating-audio-player floating-audio-player--${placement}`} role="group" aria-label={placement === 'header' ? 'Reproductor en header' : 'Reproductor flotante'}>
      {/* Cover image */}
      <Link href={`/songs/${activeSong.id}`} className="floating-player-cover-link">
        <div className="floating-player-cover">
          {activeSong.coverUrl ? (
            <Image
              src={activeSong.coverUrl}
              alt={activeSong.title}
              width={48}
              height={48}
              className="floating-player-cover-image"
            />
          ) : (
            <div className="floating-player-cover-placeholder" />
          )}
        </div>
      </Link>

      {/* Info block */}
      <Link href={`/songs/${activeSong.id}`} className="floating-player-info-link">
        <div className="floating-player-info">
          {/* <div className="floating-player-label">REPRODUCIENDO</div> */}
          <div className="floating-player-title">{activeSong.title}</div>
          <div className="floating-player-artist">{activeSong.artistName}</div>
        </div>
      </Link>

      {/* Transport controls */}
      <div className="floating-player-transport">
        <button
          type="button"
          className="floating-player-btn"
          aria-label="Canción anterior"
          onClick={handlePrevious}
          disabled={!hasQueue || queueIndex <= 0}
        >
          <span className="material-symbols-outlined">skip_previous</span>
        </button>
        <button
          type="button"
          className="floating-player-btn floating-player-btn--play"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={handleTogglePlay}
        >
          <span className="material-symbols-outlined">{isPlaying ? 'pause' : 'play_arrow'}</span>
        </button>
        <button
          type="button"
          className="floating-player-btn"
          aria-label="Siguiente canción"
          onClick={handleNext}
          disabled={!hasQueue || queueIndex >= queue.length - 1}
        >
          <span className="material-symbols-outlined">skip_next</span>
        </button>
      </div>

      {/* Progress bar */}
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={seekPercent}
        onChange={handleSeek}
        className="floating-player-progress"
        aria-label="Progreso de reproducción"
        disabled={duration <= 0}
      />

      <div className="floating-player-menu" ref={menuRef}>
        <button
          type="button"
          className="floating-player-btn floating-player-btn--menu"
          aria-label="Opciones del reproductor"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <span className="material-symbols-outlined">more_horiz</span>
        </button>

        {isMenuOpen ? (
          <div className="floating-player-dropdown" role="menu" aria-label="Opciones del reproductor">
            {isMobile ? (
              <div className="floating-player-dropdown-progress" role="none">
                <span className="floating-player-dropdown-time">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={seekPercent}
                  onChange={handleSeek}
                  className="floating-player-dropdown-progress-slider"
                  aria-label="Progreso de reproducción"
                  disabled={duration <= 0}
                />
                <span className="floating-player-dropdown-time">{formatTime(duration)}</span>
              </div>
            ) : null}
            <div className="floating-player-dropdown-volume" role="none">
              <button
                type="button"
                role="menuitem"
                className="floating-player-dropdown-item floating-player-dropdown-item--volume"
                onClick={handleToggleMute}
                aria-label={muted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{resolveVolumeIconName(volume, muted)}</span>
                {muted || volume === 0 ? 'Silenciado' : `${volumePercent}%`}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={handleVolumeChange}
                className="floating-player-volume-slider"
                aria-label="Volumen"
              />
            </div>
            <button type="button" role="menuitem" className="floating-player-dropdown-item" onClick={handlePlacementChange}>
              <span className="material-symbols-outlined" aria-hidden="true">{placement === 'header' ? 'vertical_align_bottom' : 'vertical_align_top'}</span>
              {placementLabel}
            </button>
            <button type="button" role="menuitem" className="floating-player-dropdown-item floating-player-dropdown-item--close" onClick={() => { stopAll(); setIsMenuOpen(false); }}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
              Cerrar reproductor
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

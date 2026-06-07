'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAudio } from '../../context/AudioContext';

export function FloatingAudioPlayer() {
  const { activeSong, isPlaying, currentTime, duration, queue, queueSource, queueIndex, playSong, playSongAtIndex, pause, seek } = useAudio();

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

  const seekPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const hasQueue = queueSource !== null && queue.length > 0;

  return (
    <div className="floating-audio-player" role="group" aria-label="Reproductor flotante">
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
    </div>
  );
}

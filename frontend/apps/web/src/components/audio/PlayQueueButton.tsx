'use client';

import { useState } from 'react';
import { useAudio } from '../../context/AudioContext';
import { getSongDetailById } from '../../features/song/repository';

interface SongIdentifier {
  songId: string;
  versionId?: string;
}

interface PlayQueueButtonProps {
  songIds: SongIdentifier[];
  source: 'album' | 'repertoire';
  startIndex?: number;
  className?: string;
  label?: string;
  append?: boolean;
  onPlay?: () => void;
}

export function PlayQueueButton({ songIds, source, startIndex = 0, className, label = 'Reproducir', append = false, onPlay }: PlayQueueButtonProps) {
  const { setQueue, addToQueue, playSongAtIndex, activeSong, isPlaying } = useAudio();
  const [isLoading, setIsLoading] = useState(false);

  // Determine if this will append to queue
  const willAppend = append || (activeSong && isPlaying);

  const handlePlay = async () => {
    if (songIds.length === 0 || isLoading) return;

    setIsLoading(true);

    try {
      // Fetch song details for all songs in the queue
      const songDetails = await Promise.all(
        songIds.map((songId) => getSongDetailById(songId.songId, songId.versionId))
      );

      // Filter out null results and convert to ActiveSong format
      const queueSongs = songDetails
        .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
        .map((detail) => ({
          id: detail.id,
          title: detail.title,
          artistName: detail.artistName || 'Desconocido',
          coverUrl: detail.images?.[0]?.url || detail.coverImageUrl || '',
          audioUrl: detail.audioUrl || '',
          versionId: detail.currentVersionId
        }));

      if (queueSongs.length === 0) {
        setIsLoading(false);
        return;
      }

      // If already playing and append is true or auto-detect, add to queue
      const shouldAppend = append || (activeSong && isPlaying);

      if (shouldAppend) {
        addToQueue(queueSongs, source);
      } else {
        // Replace queue and play
        setQueue(queueSongs, source, startIndex);
        playSongAtIndex(startIndex);
      }

      // Call onPlay callback if provided
      if (onPlay) {
        onPlay();
      }
    } catch (error) {
      console.error('Error fetching song details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) {
      return willAppend ? 'Agregando a la cola...' : 'Cargando...';
    }
    if (willAppend && label === 'Reproducir') {
      return 'Agregar a la cola';
    }
    return label;
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={willAppend ? 'Agregar a la cola' : label || 'Reproducir'}
      onClick={handlePlay}
      disabled={isLoading || songIds.length === 0}
    >
      <span className="material-symbols-outlined">
        {/* {isLoading ? 'hourglass_empty' : 'play_circle'} */}
      </span>
      {label ? <span>{getButtonText()}</span> : null}
    </button>
  );
}

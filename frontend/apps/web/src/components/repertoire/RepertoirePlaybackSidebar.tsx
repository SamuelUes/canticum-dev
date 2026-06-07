'use client';

import { useAudio } from '../../context/AudioContext';
import type { SongRef } from '../../types/repertoire';

interface RepertoirePlaybackSidebarProps {
  repertoireSongs: SongRef[];
}

export function RepertoirePlaybackSidebar({ repertoireSongs }: RepertoirePlaybackSidebarProps) {
  const { queue, activeSong, queueIndex, playSongAtIndex } = useAudio();

  // Get songs currently in the queue
  const queueSongIds = new Set(queue.map((s) => s.id));
  const queueSongs = repertoireSongs.filter((song) => queueSongIds.has(song.id));
  const restSongs = repertoireSongs.filter((song) => !queueSongIds.has(song.id));

  const handleQueueSongClick = (index: number) => {
    playSongAtIndex(index);
  };

  const handleRestSongClick = (song: SongRef) => {
    // This would need to add to queue and play - for now just log
    console.log('Add to queue and play:', song);
  };

  return (
    <aside className="repertoire-playback-sidebar">
      {/* Queue Section */}
      {queueSongs.length > 0 && (
        <div className="repertoire-playback-queue-section">
          <div className="repertoire-playback-section-header">
            <h3>En reproducción</h3>
            <span className="repertoire-playback-section-count">{queueSongs.length}</span>
          </div>
          <div className="repertoire-playback-song-list">
            {queueSongs.map((song, index) => {
              const isActive = activeSong?.id === song.id && queueIndex === index;
              return (
                <button
                  key={`${song.id}-${song.versionId ?? 'base'}`}
                  type="button"
                  className={`repertoire-playback-song-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleQueueSongClick(index)}
                >
                  <span className="repertoire-playback-song-num">{String(index + 1).padStart(2, '0')}</span>
                  <div className="repertoire-playback-song-info">
                    <strong>{song.title}</strong>
                    <small>{song.artistName ?? 'Sin artista'}</small>
                    {song.versionName ? <small>{song.versionName}</small> : null}
                  </div>
                  {isActive && (
                    <span className="material-symbols-outlined repertoire-playback-playing-icon">
                      equalizer
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rest of Repertoire Section */}
      {restSongs.length > 0 && (
        <div className="repertoire-playback-rest-section">
          <div className="repertoire-playback-section-header">
            <h3>Resto del repertorio</h3>
            <span className="repertoire-playback-section-count">{restSongs.length}</span>
          </div>
          <div className="repertoire-playback-song-list">
            {restSongs.map((song, index) => (
              <button
                key={`${song.id}-${song.versionId ?? 'base'}`}
                type="button"
                className="repertoire-playback-song-item"
                onClick={() => handleRestSongClick(song)}
              >
                <span className="repertoire-playback-song-num">{String(index + 1).padStart(2, '0')}</span>
                <div className="repertoire-playback-song-info">
                  <strong>{song.title}</strong>
                  <small>{song.artistName ?? 'Sin artista'}</small>
                  {song.versionName ? <small>{song.versionName}</small> : null}
                </div>
                <span className="material-symbols-outlined repertoire-playback-add-icon">
                  add
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {queueSongs.length === 0 && restSongs.length === 0 && (
        <div className="repertoire-playback-empty">
          <p>No hay canciones en el repertorio</p>
        </div>
      )}
    </aside>
  );
}

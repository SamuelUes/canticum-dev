'use client';

import Link from 'next/link';
import { useRepertoirePlayback } from './RepertoirePageClient';
import { RepertoirePageContent } from './RepertoirePageContent';
import type { repertoireDetail, SongRef } from '../../types/repertoire';

interface RepertoireSongSectionProps {
  repertoire: repertoireDetail;
  resolvedSongs: SongRef[];
  songItems: Array<{ songId: string; name: string; artistName?: string; versionId?: string }>;
  totalSongs: number;
}

export function RepertoireSongSection({
  repertoire,
  resolvedSongs,
  songItems,
  totalSongs
}: RepertoireSongSectionProps) {
  const { isPlaybackMode } = useRepertoirePlayback();

  if (isPlaybackMode) {
    return <RepertoirePageContent repertoire={repertoire} resolvedSongs={resolvedSongs} />;
  }

  return (
    <section className="repertoire-song-section" aria-label="canciones del repertorio">
      <div className="repertoire-song-section-head">
        <h2>Canciones del repertorio</h2>
        <span className="repertoire-song-section-meta">{totalSongs} elementos</span>
      </div>
      <div className="repertoire-song-grid repertoire-song-grid-single-column">
        {songItems.map((song, index) => (
          <Link
            key={`${song.songId}-${song.versionId ?? 'base'}`}
            href={song.versionId ? `/songs/${song.songId}?versionId=${encodeURIComponent(song.versionId)}` : `/songs/${song.songId}`}
            className="repertoire-song-item"
          >
            <span className="repertoire-song-num">{String(index + 1).padStart(2, '0')}</span>
            <strong>{song.name && song.name !== song.songId ? song.name : `Canción ${String(index + 1).padStart(2, '0')}`}</strong>
            <small>{song.artistName ?? 'Sin artista'}</small>
            {song.versionId ? <small>{`Versión #${song.versionId}`}</small> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { SearchEntityItem, SearchrepertoireItem, SearchSongItem } from '../../types/search';

interface MySectionProps {
  title?: string;
  songs: SearchSongItem[];
  repertoires: SearchrepertoireItem[];
}

function pickImage(item: SearchEntityItem): string | undefined {
  return item.images && item.images.length > 0 ? item.images[0]?.url : undefined;
}

function formatTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * "Mi Sección" — shows everything the current user has created.
 * Mixes their songs (public, private, draft) and repertoires (public, private, draft),
 * sorted most-recent first. Renders nothing if the user has no own content.
 */
export function MySection({ title = 'Mis creaciones', songs, repertoires }: MySectionProps) {
  if (songs.length === 0 && repertoires.length === 0) {
    return null;
  }

  const orderedSongs = [...songs].sort(
    (a, b) => formatTimestamp(b.publishedAt ?? b.createdAt) - formatTimestamp(a.publishedAt ?? a.createdAt)
  );
  const orderedRepertoires = [...repertoires].sort(
    (a, b) => (b.dateLabel || '').localeCompare(a.dateLabel || '')
  );

  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>

      {orderedSongs.length > 0 ? (
        <>
          <h3 style={{ marginTop: 8 }}>Mis canciones</h3>
          <div className="featured-grid">
            {orderedSongs.slice(0, 8).map((song) => {
              const imageUrl = pickImage(song);
              return (
                <Link key={song.id} href={`/songs/${song.songId ?? song.id}`} className="song-card">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={song.title} className="song-thumb-image" width={300} height={92} />
                  ) : (
                    <div className="song-thumb" />
                  )}
                  <div className="song-card-body">
                    <strong>{song.title}</strong>
                    <small>{song.subtitle || song.authorOrChoir}</small>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {orderedRepertoires.length > 0 ? (
        <>
          <h3 style={{ marginTop: 16 }}>Mis repertorios</h3>
          <div className="featured-grid">
            {orderedRepertoires.slice(0, 8).map((repertoire) => {
              const imageUrl = pickImage(repertoire);
              return (
                <Link key={repertoire.id} href={`/repertoires/${repertoire.repertoireId ?? repertoire.id}`} className="song-card">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={repertoire.title} className="song-thumb-image" width={300} height={92} />
                  ) : (
                    <div className="song-thumb" />
                  )}
                  <div className="song-card-body">
                    <strong>{repertoire.title}</strong>
                    <small>
                      {repertoire.isPublic ? 'Público' : 'Privado'} · {repertoire.songsCount} canciones
                    </small>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

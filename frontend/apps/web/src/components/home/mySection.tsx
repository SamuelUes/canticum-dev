'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { SearchEntityItem, SearchrepertoireItem, SearchSongItem } from '../../types/search';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';

interface MySectionProps {
  title?: string;
  songs: SearchSongItem[];
  repertoires: SearchrepertoireItem[];
}

function pickImage(item: SearchEntityItem): string | undefined {
  if (item.images && item.images.length > 0) {
    return item.images[0]?.url;
  }

  const raw = item as SearchEntityItem & { coverImageUrl?: string; coverUrl?: string };
  if (typeof raw.coverImageUrl === 'string' && raw.coverImageUrl.trim().length > 0) {
    return raw.coverImageUrl;
  }
  if (typeof raw.coverUrl === 'string' && raw.coverUrl.trim().length > 0) {
    return raw.coverUrl;
  }

  return undefined;
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
        <div className="my-section-block">
          <h3 className="my-section-heading">Mis canciones</h3>
          <HorizontalConveyor ariaLabel="Mis canciones" className="my-section-conveyor">
            <div className="my-section-track" role="listbox" aria-label="Mis canciones">
              {orderedSongs.slice(0, 8).map((song) => {
                const imageUrl = pickImage(song);
                return (
                  <Link
                    key={song.id}
                    href={`/songs/${song.songId ?? song.id}`}
                    className="song-card my-section-card"
                    role="option"
                    aria-label={song.title}
                  >
                    {imageUrl ? (
                      <div className="song-thumb-image-wrap my-section-thumb">
                        <Image
                          src={imageUrl}
                          alt={song.title}
                          fill
                          className="song-thumb-image"
                          sizes="(max-width: 768px) 60vw, 180px"
                        />
                      </div>
                    ) : (
                      <div className="song-thumb my-section-thumb" />
                    )}
                    <div className="song-card-body">
                      <strong>{song.title}</strong>
                      <small>{song.subtitle || song.authorOrChoir}</small>
                    </div>
                  </Link>
                );
              })}
            </div>
          </HorizontalConveyor>
        </div>
      ) : null}

      {orderedRepertoires.length > 0 ? (
        <div className="my-section-block">
          <h3 className="my-section-heading">Mis repertorios</h3>
          <HorizontalConveyor ariaLabel="Mis repertorios" className="my-section-conveyor">
            <div className="my-section-track" role="listbox" aria-label="Mis repertorios">
              {orderedRepertoires.slice(0, 8).map((repertoire) => {
                const imageUrl = pickImage(repertoire);
                return (
                  <Link
                    key={repertoire.id}
                    href={`/repertoires/${repertoire.repertoireId ?? repertoire.id}`}
                    className="song-card my-section-card"
                    role="option"
                    aria-label={repertoire.title}
                  >
                    {imageUrl ? (
                      <div className="song-thumb-image-wrap my-section-thumb">
                        <Image
                          src={imageUrl}
                          alt={repertoire.title}
                          fill
                          className="song-thumb-image"
                          sizes="(max-width: 768px) 60vw, 180px"
                        />
                      </div>
                    ) : (
                      <div className="song-thumb my-section-thumb" />
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
          </HorizontalConveyor>
        </div>
      ) : null}
    </section>
  );
}

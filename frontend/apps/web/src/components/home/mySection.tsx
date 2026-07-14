'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { SearchEntityItem, SearchrepertoireItem, SearchSongItem } from '../../types/search';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  UPLOADED: 'Archivo subido',
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazada',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Archivada'
};

function resolveStatusPill(
  status: string | undefined,
  isAdmin: boolean
): { label: string; code: string } | null {
  if (!status) return null;
  const code = status.trim().toUpperCase();
  if (!code || !(code in STATUS_LABELS)) return null;
  if (!isAdmin && code !== 'DRAFT') return null;
  return { label: STATUS_LABELS[code], code: code.toLowerCase() };
}

interface MySectionProps {
  title?: string;
  songs: SearchSongItem[];
  repertoires: SearchrepertoireItem[];
}

function pickImage(item: SearchEntityItem): string | undefined {
  if (item.images && item.images.length > 0) {
    return item.images[0]?.url;
  }

  const raw = item as SearchEntityItem & { coverImageUrl?: string; coverUrl?: string; imageUrl?: string };
  if (typeof raw.imageUrl === 'string' && raw.imageUrl.trim().length > 0) {
    return raw.imageUrl;
  }
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const orderedSongs = useMemo(() => {
    return [...songs]
      .sort((a, b) => formatTimestamp(b.publishedAt ?? b.createdAt) - formatTimestamp(a.publishedAt ?? a.createdAt))
      .slice(0, 8);
  }, [songs]);

  const orderedRepertoires = useMemo(() => {
    return [...repertoires]
      .sort((a, b) => (b.dateLabel || '').localeCompare(a.dateLabel || ''))
      .slice(0, 8);
  }, [repertoires]);

  if (orderedSongs.length === 0 && orderedRepertoires.length === 0) {
    return null;
  }

  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>

      {orderedSongs.length > 0 ? (
        <div className="my-section-block">
          <h3 className="my-section-heading">Mis canciones</h3>
          <HorizontalConveyor ariaLabel="Mis canciones" className="my-section-conveyor">
            <div className="my-section-track" role="list" aria-label="Mis canciones">
              {orderedSongs.map((song) => {
                const imageUrl = pickImage(song);
                return (
                  <Link
                    key={song.id}
                    href={`/songs/${song.songId ?? song.id}`}
                    className="song-card my-section-card"
                    role="link"
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
                          loading="lazy"
                        />
                        {(() => {
                          const pill = resolveStatusPill(song.status, isAdmin);
                          return pill ? <span className={`home-status-pill status-${pill.code}`}>{pill.label}</span> : null;
                        })()}
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
            <div className="my-section-track" role="list" aria-label="Mis repertorios">
              {orderedRepertoires.map((repertoire) => {
                const imageUrl = pickImage(repertoire);
                return (
                  <Link
                    key={repertoire.id}
                    href={`/repertoires/${repertoire.repertoireId ?? repertoire.id}`}
                    className="song-card my-section-card"
                    role="link"
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
                          loading="lazy"
                        />
                        {(() => {
                          const pill = resolveStatusPill(repertoire.status, isAdmin);
                          return pill ? <span className={`home-status-pill status-${pill.code}`}>{pill.label}</span> : null;
                        })()}
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

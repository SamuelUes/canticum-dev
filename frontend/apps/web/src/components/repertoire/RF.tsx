'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchRepertoireDetailClient, requestSearchRepertoireSongs } from '../../features/repertoire/clientPersistence';
import { getSongTitleById } from '../../features/song/repository';

interface RepertoireDetailClientFallbackProps {
  repertoireId: string;
}

interface Song {
  songId: string;
  versionId?: string;
  name: string;
  artistName?: string;
}

interface RepertoireSummary {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  createdBy?: string;
  isPublic?: boolean;
  liturgicalType?: string;
  status?: string;
  coverImageUrl?: string;
  songs: Song[];
}

function parseUnknownDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      try {
        const parsed = (value as { toDate: () => Date }).toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      } catch {
        return null;
      }
    }

    const seconds = Number((value as { _seconds?: unknown; seconds?: unknown })._seconds ?? (value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function formatDateForUi(value: unknown): string {
  const date = parseUnknownDate(value);
  if (!date) {
    return 'N/D';
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function toSongs(raw: Record<string, unknown>): Song[] {
  const selected = Array.isArray(raw.selectedSongs) ? raw.selectedSongs : [];
  const ids = Array.isArray(raw.songIds) ? (raw.songIds as unknown[]).map((v) => String(v)) : [];

  if (selected.length > 0) {
    return (selected as Array<Record<string, unknown>>).map((entry) => ({
      songId: String(entry.songId ?? ''),
      versionId: typeof entry.versionId === 'string' ? entry.versionId : undefined,
      name: String(entry.songId ?? '')
    }));
  }

  return ids.map((id) => ({ songId: id, name: id }));
}

async function resolveSongNames(songs: Song[]): Promise<Song[]> {
  if (songs.length === 0) {
    return songs;
  }

  const resolved = await Promise.allSettled(songs.map((song) => getSongTitleById(song.songId, song.versionId)));

  return songs.map((song, index) => {
    const result = resolved[index];
    if (result.status === 'fulfilled' && result.value) {
      return {
        ...song,
        songId: result.value.id,
        name: result.value.title,
        artistName: song.artistName ?? result.value.artistName,
        ...(result.value.versionId ? { versionId: result.value.versionId } : {})
      };
    }

    return song;
  });
}

async function resolveSongNamesWithSearchFallback(songs: Song[]): Promise<Song[]> {
  const primary = await resolveSongNames(songs);

  const next = [...primary];
  for (let index = 0; index < next.length; index += 1) {
    const song = next[index];
    if (song.name && song.name !== song.songId) {
      continue;
    }

    const searchTerms = [song.songId, song.versionId].filter((value): value is string => Boolean(value && value.trim().length > 0));
    for (const term of searchTerms) {
      const options = await requestSearchRepertoireSongs(term, 12);
      const match = options.find((option) => {
        const bySong = option.songId === song.songId;
        const byVersion = song.versionId ? option.versionId === song.versionId : true;
        return bySong && byVersion;
      }) ?? options.find((option) => option.songId === song.songId);

      if (!match) {
        continue;
      }

      const canonical = await getSongTitleById(match.songId, song.versionId ?? match.versionId ?? undefined);

      next[index] = {
        ...song,
        songId: canonical?.id ?? song.songId,
        name: match.title,
        artistName: song.artistName ?? match.artistName ?? undefined,
        ...(canonical?.versionId
          ? { versionId: canonical.versionId }
          : song.versionId
            ? { versionId: song.versionId }
            : match.versionId
              ? { versionId: match.versionId }
              : {})
      };
      break;
    }
  }

  return next;
}

export function RepertoireDetailClientFallback({ repertoireId }: RepertoireDetailClientFallbackProps) {
  const [repertoire, setRepertoire] = useState<RepertoireSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found'>('loading');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const raw = await fetchRepertoireDetailClient(repertoireId);
      if (!alive) {
        return;
      }

      if (!raw) {
        setStatus('not_found');
        return;
      }

      const baseSongs = toSongs(raw);
      const songs = await resolveSongNamesWithSearchFallback(baseSongs);

      if (!alive) {
        return;
      }

      setRepertoire({
        id: String(raw.id ?? repertoireId),
        title: String(raw.title ?? 'Repertorio'),
        description: typeof raw.description === 'string' ? raw.description : '',
        createdAt: formatDateForUi((raw as { updatedAt?: unknown }).updatedAt ?? raw.createdAt),
        createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
        isPublic: Boolean(raw.isPublic),
        liturgicalType: String(raw.liturgicalType ?? 'General'),
        status: String(raw.status ?? 'Borrador'),
        coverImageUrl: typeof raw.coverImageUrl === 'string' && raw.coverImageUrl.trim().length > 0
          ? raw.coverImageUrl
          : Array.isArray(raw.images)
            ? String(((raw.images[0] ?? {}) as { url?: unknown }).url ?? '')
            : undefined,
        songs
      });
      setStatus('ready');
    };

    void load();

    return () => {
      alive = false;
    };
  }, [repertoireId]);

  if (status === 'loading') {
    return (
      <section className="search-results-panel">
        <header className="search-results-head">
          <h1>Cargando repertorio…</h1>
        </header>
      </section>
    );
  }

  if (status === 'not_found' || !repertoire) {
    return (
      <section className="search-results-panel">
        <header className="search-results-head">
          <h1>Repertorio no encontrado</h1>
          <p>El repertorio puede ser privado o no existe. Inicia sesión nuevamente si es tuyo.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="search-results-panel repertoire-detail-shell">
      <header className="search-results-head repertoire-detail-header">
        <p className="repertoire-detail-kicker">Repertorio Litúrgico</p>
        <h1 className="repertoire-detail-title">{repertoire.title}</h1>
      </header>

      <article className="search-generic-card repertoire-detail-card repertoire-detail-meta-card">
        <div className="repertoire-detail-meta-actions">
          <Link href={`/repertoires/${repertoire.id}/edit`} className="repertoire-detail-edit-link" aria-label="Editar repertorio">
            <Image
              src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png"
              alt="Editar"
              width={18}
              height={18}
            />
            <span>Editar</span>
          </Link>
        </div>

        <div className="repertoire-detail-meta-top">
          <div className="repertoire-detail-meta-main">
            <div className="repertoire-detail-meta-row">
              <span className="repertoire-detail-meta-label">Tipo</span>
              <strong>{repertoire.liturgicalType}</strong>
            </div>

            {repertoire.description ? (
              <div className="repertoire-detail-meta-row">
                <span className="repertoire-detail-meta-label">DescripciónAAA</span>
                <p>{repertoire.description}</p>
              </div>
            ) : null}

            {repertoire.createdBy ? (
              <div className="repertoire-detail-meta-row">
                <span className="repertoire-detail-meta-label">Creado por</span>
                <span>{repertoire.createdBy}</span>
              </div>
            ) : null}
          </div>

          {repertoire.coverImageUrl ? (
            <div className="repertoires-card-image-wrap repertoire-detail-cover-wrap">
              <Image
                src={repertoire.coverImageUrl}
                alt={`Portada de ${repertoire.title}`}
                fill
                className="repertoires-card-image"
                sizes="(max-width: 900px) 100vw, 320px"
              />
            </div>
          ) : (
            <div className="repertoires-card-image-wrap repertoire-detail-cover-wrap is-empty" aria-hidden>
              <span>Sin imagen</span>
            </div>
          )}
        </div>

        <div className="repertoire-detail-meta-grid">
          <div className="repertoire-detail-meta-pill">
            <span>Visibilidad</span>
            <strong>{repertoire.isPublic ? 'Público' : 'Privado'}</strong>
          </div>
          <div className="repertoire-detail-meta-pill">
            <span>Estado</span>
            <strong>{repertoire.status ?? 'Borrador'}</strong>
          </div>
          {repertoire.createdAt ? (
            <div className="repertoire-detail-meta-pill">
              <span>Fecha</span>
              <strong>{repertoire.createdAt}</strong>
            </div>
          ) : null}
          <div className="repertoire-detail-meta-pill">
            <span>Canciones</span>
            <strong>{repertoire.songs.length}</strong>
          </div>
        </div>
      </article>

      <section className="repertoire-song-list" aria-label="canciones del repertorio">
        <h2>Canciones del repertorio</h2>
        <div className="repertoire-song-grid repertoire-song-grid-single-column">
          {repertoire.songs.map((song, index) => (
            <Link
              key={`${song.songId}-${song.versionId ?? 'base'}`}
              href={song.versionId ? `/songs/${song.songId}?versionId=${encodeURIComponent(song.versionId)}` : `/songs/${song.songId}`}
              className="repertoire-song-item"
            >
              <span className="repertoire-song-num">{String(index + 1).padStart(2, '0')}</span>
              <strong>{song.name && song.name !== song.songId ? song.name : `Canción ${String(index + 1).padStart(2, '0')}`}</strong>
              {song.artistName ? <small>{song.artistName}</small> : null}
              {song.versionId ? <small>{`Versión #${song.versionId}`}</small> : null}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

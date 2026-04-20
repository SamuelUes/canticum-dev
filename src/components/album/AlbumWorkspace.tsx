'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AlbumDetail, AlbumSongRow } from '../../types/album';

type FilterPill = 'Todas' | 'Letra' | 'Partituras';

interface AlbumWorkspaceProps {
  album: AlbumDetail;
}

export function AlbumWorkspace({ album }: AlbumWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<FilterPill>('Todas');
  const pills: FilterPill[] = ['Todas', 'Letra', 'Partituras'];

  const albumTypeLabel: Record<string, string> = {
    album: 'Álbum',
    single: 'Sencillo',
    ep: 'EP',
    compilation: 'Compilación',
    live: 'En Vivo'
  };

  const filteredSongs: AlbumSongRow[] = useMemo(() => {
    if (activeFilter === 'Letra') return album.songs.filter((s) => s.hasLyrics);
    if (activeFilter === 'Partituras') return album.songs.filter((s) => s.hasSheet);
    return album.songs;
  }, [activeFilter, album.songs]);

  const totalViews = album.songs.reduce((acc, s) => acc + s.views, 0);

  const padNumber = (n: number): string => String(n).padStart(2, '0');

  return (
    <div className="album-layout">
      {/* ── Hero cover ── */}
      <section className="album-hero">
        <div className="album-cover-wrap">
          {album.coverUrl ? (
            <Image
              src={album.coverUrl}
              alt={album.title}
              width={220}
              height={220}
              className="album-cover-img"
            />
          ) : (
            <div className="album-cover-placeholder" aria-hidden>
              <span>{album.title.charAt(0)}</span>
            </div>
          )}
        </div>

        <div className="album-hero-info">
          <span className="album-type-badge">
            {albumTypeLabel[album.albumType] ?? 'Álbum'}
          </span>

          <h1 className="album-title">{album.title}</h1>

          <div className="album-hero-meta">
            <Link
              href={`/artists/${album.artistId}`}
              className="album-artist-link"
            >
              {album.artistImageUrl ? (
                <Image
                  src={album.artistImageUrl}
                  alt={album.artistName}
                  width={28}
                  height={28}
                  className="album-artist-avatar"
                />
              ) : (
                <span className="album-artist-avatar album-artist-avatar--placeholder" aria-hidden>
                  {album.artistName.charAt(0)}
                </span>
              )}
              <span>{album.artistName}</span>
            </Link>

            <span className="album-meta-dot">·</span>
            <span className="album-meta-year">{album.releaseYear}</span>
            <span className="album-meta-dot">·</span>
            <span className="album-meta-songs">{album.songsCount} canciones</span>
            {totalViews > 0 ? (
              <>
                <span className="album-meta-dot">·</span>
                <span className="album-meta-views">{totalViews.toLocaleString()} visualizaciones</span>
              </>
            ) : null}
          </div>

          {album.description ? (
            <p className="album-description">{album.description}</p>
          ) : null}
        </div>
      </section>

      {/* ── Track list ── */}
      <section className="album-tracklist-section">
        <nav className="artist-pills album-pills" aria-label="filtrar canciones">
          {pills.map((pill) => (
            <button
              key={pill}
              type="button"
              className={`artist-pill ${activeFilter === pill ? 'is-active' : ''}`}
              onClick={() => setActiveFilter(pill)}
            >
              {pill}
            </button>
          ))}
        </nav>

        <div className="artist-table-head album-table-head">
          <span className="artist-col-num">#</span>
          <span className="artist-col-thumb" />
          <span className="artist-col-song">Canción</span>
          <span className="artist-col-views">Visualizaciones</span>
          <span className="artist-col-tone">Tono</span>
        </div>

        <ul className="artist-song-list" role="list">
          {filteredSongs.map((song) => (
            <li key={song.id} className="artist-song-row">
              <span className="artist-col-num">
                {padNumber(song.trackNumber ?? 0)}
              </span>

              <span className="artist-col-thumb">
                {song.thumbnailUrl ? (
                  <Image
                    src={song.thumbnailUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="artist-song-thumb"
                  />
                ) : (
                  <span className="artist-song-thumb-placeholder" aria-hidden />
                )}
              </span>

              <Link href={`/songs/${song.id}`} className="artist-col-song">
                {song.title}
                {song.isVerified ? (
                  <span className="artist-verified-badge" title="Verificado">✔</span>
                ) : null}
                {!song.isPrimaryRelease ? (
                  <span className="album-feature-badge" title="Aparece en este álbum">feat.</span>
                ) : null}
              </Link>

              <span className="artist-col-views">{song.views.toLocaleString()}</span>
              <span className="artist-col-tone">{song.tone}</span>
            </li>
          ))}

          {filteredSongs.length === 0 ? (
            <li className="artist-song-row artist-empty-row">
              <span>
                No hay canciones con {activeFilter.toLowerCase()} disponibles.
              </span>
            </li>
          ) : null}
        </ul>
      </section>

      {/* ── Back to artist ── */}
      <div className="album-back-row">
        <Link href={`/artists/${album.artistId}`} className="album-back-link">
          ‹ Volver al perfil de {album.artistName}
        </Link>
      </div>
    </div>
  );
}

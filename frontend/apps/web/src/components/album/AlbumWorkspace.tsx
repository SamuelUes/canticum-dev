'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { requestUpdateAlbumStatus} from '../../features/album/repository';
import { loadAlbumFavorite, saveAlbumFavorite } from '../../features/album/clientPersistence';
import { loadSongFavorite, saveSongFavorite } from '../../features/song/clientPersistence';
import { getSongStatusLabel } from '../../features/song/status';
import type { AlbumDetail, AlbumSongRow } from '../../types/album';

type FilterPill = 'Todas' | 'Letra' | 'Partituras';

interface AlbumWorkspaceProps {
  album: AlbumDetail;
}

export function AlbumWorkspace({ album }: AlbumWorkspaceProps) {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterPill>('Todas');
  const [albumStatusSelection, setAlbumStatusSelection] = useState(() => (typeof album.status === 'string' ? album.status.toUpperCase() : 'APPROVED'));
  const [isAlbumStatusMenuOpen, setIsAlbumStatusMenuOpen] = useState(false);
  const [isUpdatingAlbumStatus, setIsUpdatingAlbumStatus] = useState(false);
  const [songFavorites, setSongFavorites] = useState<Record<string, boolean>>({});
  const [isAlbumFavorite, setIsAlbumFavorite] = useState(false);
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
  const isAdminUser = user?.role === 'admin';
  const albumStatusLabel = albumStatusSelection.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

  // Load song favorites on mount
  useEffect(() => {
    album.songs.forEach((song) => {
      loadSongFavorite(song.id, 'default').then((favorite) => {
        if (typeof favorite === 'boolean') {
          setSongFavorites((prev) => ({ ...prev, [song.id]: favorite }));
        }
      });
    });
  }, [album.songs]);

  // Load album favorite on mount
  useEffect(() => {
    loadAlbumFavorite(album.id).then((favorite) => {
      if (typeof favorite === 'boolean') {
        setIsAlbumFavorite(favorite);
      }
    });
  }, [album.id]);

  const handleToggleFavorite = async (songId: string) => {
    const currentFavorite = songFavorites[songId] ?? false;
    const nextFavorite = !currentFavorite;
    
    setSongFavorites((prev) => ({ ...prev, [songId]: nextFavorite }));
    
    try {
      await saveSongFavorite(songId, 'default', nextFavorite);
    } catch {
      // Revert on error
      setSongFavorites((prev) => ({ ...prev, [songId]: currentFavorite }));
    }
  };

  const handleToggleAlbumFavorite = async () => {
    const nextFavorite = !isAlbumFavorite;
    setIsAlbumFavorite(nextFavorite);
    
    try {
      await saveAlbumFavorite(album.id, nextFavorite);
    } catch {
      // Revert on error
      setIsAlbumFavorite(!nextFavorite);
    }
  };

  const onAdminChangeAlbumStatus = async () => {
    if (!isAdminUser || isUpdatingAlbumStatus) {
      return;
    }

    setIsUpdatingAlbumStatus(true);
    const result = await requestUpdateAlbumStatus(album.id, albumStatusSelection);
    setIsUpdatingAlbumStatus(false);

    if (result.ok && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

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

            <div className="album-meta"> 
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
          </div>

          <div className="album-hero-actions">
            <button
              type="button"
              className={`album-favorite-icon ${isAlbumFavorite ? 'is-active' : ''}`}
              aria-label={isAlbumFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              aria-pressed={isAlbumFavorite}
              onClick={handleToggleAlbumFavorite}
            >
              <span className="material-symbols-outlined">
                {isAlbumFavorite ? 'favorite' : 'favorite_border'}
              </span>
            </button>
          </div>

          {isAdminUser ? (
            <div className="album-admin-actions">
              <div className="song-admin-status-combobox album-status-combobox" data-open={isAlbumStatusMenuOpen ? 'true' : 'false'}>
                <button
                  type="button"
                  className="song-admin-status-combobox-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={isAlbumStatusMenuOpen}
                  aria-label="Cambiar estado de álbum"
                  onClick={() => setIsAlbumStatusMenuOpen((prev) => !prev)}
                >
                  <span className="song-admin-status-combobox-copy">
                    <small>Estado actual</small>
                    <strong>{albumStatusLabel}</strong>
                  </span>
                  <span className="song-admin-status-combobox-chevron" aria-hidden>
                    ▾
                  </span>
                </button>

                {isAlbumStatusMenuOpen ? (
                  <div className="song-admin-status-combobox-menu album-status-combobox-menu" role="listbox" aria-label="Opciones de estado del álbum">
                    {['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED'].map((option) => {
                      const isActive = albumStatusSelection === option;
                      const label = option.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
                      return (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`song-admin-status-combobox-option status-${option.toLowerCase()} ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            setAlbumStatusSelection(option);
                            setIsAlbumStatusMenuOpen(false);
                          }}
                        >
                          <span className="song-admin-status-combobox-option-top">
                            <strong>{label}</strong>
                            {isActive ? <span className="song-admin-status-combobox-current">Actual</span> : null}
                          </span>
                          <small>Actualizar estado del álbum</small>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <button type="button" className="song-premium-badge" onClick={onAdminChangeAlbumStatus} disabled={isUpdatingAlbumStatus}>
                {isUpdatingAlbumStatus ? 'Actualizando...' : 'Aplicar estado'}
              </button>
            </div>
          ) : null}

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
          {isAdminUser ? <span className="artist-col-status">Estado</span> : null}
          <span className="artist-col-tone">Tono</span>
          <span className="artist-col-views">Visualizaciones</span>
          <span className="artist-col-favorite" />
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
              </Link>

              {isAdminUser ? (
                <span className="artist-col-status">
                  <span className={`song-status-badge status-${song.status?.toLowerCase()}`}>{getSongStatusLabel(song.status)}</span>
                </span>
              ) : null}

              <span className="artist-col-tone">{song.tone}</span>
              <span className="artist-col-views">{song.views.toLocaleString()}</span>
              <span className="artist-col-favorite">
                <button
                  type="button"
                  className={`song-favorite-icon ${songFavorites[song.id] ? 'is-active' : ''}`}
                  aria-label={songFavorites[song.id] ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                  aria-pressed={songFavorites[song.id]}
                  onClick={() => handleToggleFavorite(song.id)}
                >
                  <span className="material-symbols-outlined">
                    {songFavorites[song.id] ? 'favorite' : 'favorite_border'}
                  </span>
                </button>
              </span>
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

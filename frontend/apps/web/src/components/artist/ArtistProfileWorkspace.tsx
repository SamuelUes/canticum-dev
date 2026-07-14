'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  getArtistDetailById,
  getPublicrepertoiresForArtist,
  loadArtistFavoriteState,
  requestTrackArtistProfileView,
  saveArtistFavoriteState
} from '../../features/artist/repository';
import { getArtistProfileHref } from '../../features/artist/routing';
import { useAuth } from '../../context/AuthContext';
import { isModeratorUser } from '../../features/auth/repository';
import { getSongStatusLabel, normalizeSongStatus } from '../../features/song/status';
import { getAlbumStatusLabel, normalizeAlbumStatus } from '../../features/album/status';
import { SkeletonList } from '../ui/skeleton';
import { ShareButton } from '../shared/ShareButton';
import type { ArtistDetail, ArtistImage, ArtistrepertoireRef, ArtistSongRow } from '../../types/artist';

function pickImage(images: ArtistImage[] | undefined, targetSize: number, fallback?: string): string | undefined {
  if (!images || images.length === 0) {
    return fallback;
  }
  // Prefer the smallest image whose dimension is >= target; else largest available.
  const withDims = images.filter((img) => typeof img.width === 'number');
  const sorted = [...(withDims.length > 0 ? withDims : images)].sort(
    (a, b) => (a.width ?? Number.MAX_SAFE_INTEGER) - (b.width ?? Number.MAX_SAFE_INTEGER)
  );
  const match = sorted.find((img) => (img.width ?? 0) >= targetSize);
  return (match ?? sorted[sorted.length - 1] ?? images[0]).url ?? fallback;
}

type FilterPill = 'Letra' | 'Partituras' | 'Repertorios';

interface ArtistProfileWorkspaceProps {
  artist: ArtistDetail;
  repertoires: ArtistrepertoireRef[];
}

export function ArtistProfileWorkspace({ artist, repertoires }: ArtistProfileWorkspaceProps) {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterPill>('Letra');
  const [favoriteState, setFavoriteState] = useState<{ isFavorite: boolean; likeCount: number }>({
    isFavorite: false,
    likeCount: artist.likeCount
  });
  const [showAllSongsModal, setShowAllSongsModal] = useState(false);
  const [isFavoritePending, setIsFavoritePending] = useState(false);
  const [resolvedArtist, setResolvedArtist] = useState<ArtistDetail>(artist);
  const [resolvedRepertoires, setResolvedRepertoires] = useState<ArtistrepertoireRef[]>(repertoires);
  const pills: FilterPill[] = ['Letra', 'Partituras', 'Repertorios'];

  const artistData = resolvedArtist;

  useEffect(() => {
    setResolvedArtist(artist);
    setResolvedRepertoires(repertoires);
  }, [artist, repertoires]);

  useEffect(() => {
    let active = true;

    const hydrateArtist = async (): Promise<void> => {
      const fetchedArtist = await getArtistDetailById(artist.id);
      if (!active || !fetchedArtist) {
        return;
      }

      setResolvedArtist(fetchedArtist);
      const fetchedRepertoires = await getPublicrepertoiresForArtist(fetchedArtist.songs.map((song) => song.id));
      if (!active) {
        return;
      }
      setResolvedRepertoires(fetchedRepertoires);
    };

    void hydrateArtist();

    return () => {
      active = false;
    };
  }, [artist.id]);

  const totalViews = Number.isFinite(artistData.totalViews) ? artistData.totalViews : 0;
  const displayArtistName = artistData.name.trim().length > 0 ? artistData.name : 'Artista';
  const avatarSrc = pickImage(artistData.images, 160, artistData.imageUrl);

  const discographyCards = useMemo(() => {
    return artistData.discography.slice(0, 5).map((album, index) => {
      const normalizedStatus = normalizeAlbumStatus(album.moderationState);
      return {
        id: album.id || `album-${index}`,
        title: album.title,
        year: album.year,
        coverUrl: album.coverUrl,
        moderationState: normalizedStatus,
        reviewStatus: (normalizedStatus === 'PUBLISHED' || normalizedStatus === 'APPROVED' ? 'reviewed' : 'pending') as 'reviewed' | 'pending',
        href: album.id
          ? `/albums/${album.id}`
          : album.songId
            ? `/songs/${album.songId}`
            : `/search?artist=${encodeURIComponent(displayArtistName)}`
      };
    });
  }, [artistData.discography, displayArtistName]);

  const relatedArtists = useMemo(() => {
    return artistData.suggestedArtists
      .filter((item) => item.name.toLowerCase() !== displayArtistName.toLowerCase())
      .slice(0, 5)
      .map((item, index) => ({
        id: item.id || `related-${index}`,
        name: item.name,
        imageUrl: pickImage(item.images, 160, item.imageUrl)
      }));
  }, [displayArtistName, artistData.suggestedArtists]);

  useEffect(() => {
    void requestTrackArtistProfileView(artistData.id);
  }, [artistData.id]);

  useEffect(() => {
    let active = true;

    setFavoriteState((prev) => ({
      isFavorite: prev.isFavorite,
      likeCount: artist.likeCount
    }));

    loadArtistFavoriteState(artist.id).then((state) => {
      if (!active || !state) {
        return;
      }
      setFavoriteState(state);
    }).catch(() => {
      // no-op
    });

    return () => {
      active = false;
    };
  }, [artist.id, artist.likeCount]);

  const fanCount = Math.max(artistData.followers?.total ?? artistData.likeCount, favoriteState.likeCount, 0);

  const filteredSongs: ArtistSongRow[] = useMemo(() => {
    if (activeFilter === 'Letra') {
      return artistData.songs.filter((song) => song.hasLyrics);
    }

    if (activeFilter === 'Partituras') {
      return artistData.songs.filter((song) => song.hasSheet);
    }

    return [];
  }, [activeFilter, artistData.songs]);

  const relevantrepertoires: ArtistrepertoireRef[] = useMemo(() => {
    if (activeFilter !== 'Repertorios') {
      return [];
    }

    const artistSongIdSet = new Set(artistData.songs.map((song) => song.id));
    return resolvedRepertoires.filter((repertoire) =>
      repertoire.songIds.some((songId) => artistSongIdSet.has(songId))
    );
  }, [activeFilter, artistData.songs, resolvedRepertoires]);

  const songsToRender = useMemo(() => {
    if (filteredSongs.length > 0) {
      return filteredSongs.map((song) => {
        const normalizedStatus = normalizeSongStatus(song.moderationState);
        return {
          ...song,
          moderationState: normalizedStatus,
          reviewStatus: (normalizedStatus === 'PUBLISHED' || normalizedStatus === 'APPROVED' ? 'reviewed' : 'pending') as 'reviewed' | 'pending'
        };
      });
    }

    if (activeFilter === 'Letra' || activeFilter === 'Partituras') {
      return artistData.songs.map((song) => {
        const normalizedStatus = normalizeSongStatus(song.moderationState);
        return {
          ...song,
          moderationState: normalizedStatus,
          reviewStatus: (normalizedStatus === 'PUBLISHED' || normalizedStatus === 'APPROVED' ? 'reviewed' : 'pending') as 'reviewed' | 'pending'
        };
      });
    }

    return [] as ArtistSongRow[];
  }, [activeFilter, filteredSongs, artistData.songs]);

  const displayedSongs = useMemo(() => {
    return songsToRender.slice(0, 5);
  }, [songsToRender]);

  const hasMoreSongs = songsToRender.length > 5;

  const metricGenreLabel = useMemo(() => {
    const genres = Array.isArray(artistData.genres)
      ? artistData.genres
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
      : [];

    return genres.slice(0, 2).join(' / ') || artistData.ministryType || 'General';
  }, [artistData.genres, artistData.ministryType]);

  const canViewStatus = isModeratorUser(user);

  const padNumber = (index: number): string => String(index + 1).padStart(2, '0');

  const handleToggleFavorite = async (): Promise<void> => {
    if (isFavoritePending) {
      return;
    }

    const nextIsFavorite = !favoriteState.isFavorite;
    const fallbackLikeCount = Math.max(favoriteState.likeCount + (nextIsFavorite ? 1 : -1), 0);

    setIsFavoritePending(true);
    setFavoriteState({
      isFavorite: nextIsFavorite,
      likeCount: fallbackLikeCount
    });

    try {
      const persisted = await saveArtistFavoriteState(artistData.id, nextIsFavorite);
      if (persisted) {
        setFavoriteState(persisted);
      }
    } catch {
      setFavoriteState((prev) => ({
        isFavorite: !nextIsFavorite,
        likeCount: Math.max(prev.likeCount + (nextIsFavorite ? -1 : 1), 0)
      }));
    } finally {
      setIsFavoritePending(false);
    }
  };

  return (
    <div className="artist-profile-container">
      {/* ── Left sidebar with artist info and quick actions ── */}
      <aside className="artist-sidebar-glass">
        <div className="artist-avatar-section">
          {avatarSrc ? (
            <div className="artist-avatar-ring">
              <Image src={avatarSrc} alt={displayArtistName} width={80} height={80} className="artist-avatar-modern" />
            </div>
          ) : (
            <div className="artist-avatar-ring artist-avatar-placeholder-modern" aria-hidden>
              <span>{displayArtistName.charAt(0)}</span>
            </div>
          )}
          <h1 className="artist-name-display">{displayArtistName}</h1>
          <p className="artist-genre-label">{metricGenreLabel}</p>
        </div>

        <div className="artist-quick-actions">
          <button
            type="button"
            className={`artist-action-modern ${favoriteState.isFavorite ? 'is-favorite' : ''}`}
            aria-label={favoriteState.isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}
            onClick={handleToggleFavorite}
            disabled={isFavoritePending}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {favoriteState.isFavorite ? 'favorite' : 'favorite_border'}
            </span>
            <span>{favoriteState.isFavorite ? 'En Favoritos' : 'Favorito'}</span>
          </button>
          <ShareButton
            shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/artists/${artist.id}` : undefined}
            shareTitle={`${artist.name} — Canticum`}
            shareText={`Mira a ${artist.name} en Canticum`}
            className="artist-action-modern"
            style={{ width: '100%' }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">share</span>
            <span>Compartir</span>
          </ShareButton>
        </div>

        <div className="artist-metrics-mini">
          <div className="metric-item">
            <strong>{fanCount.toLocaleString()}</strong>
            <small>Fans</small>
          </div>
          <div className="metric-item">
            <strong>{totalViews.toLocaleString()}</strong>
            <small>Vistas</small>
          </div>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <section className="artist-main-content">
        {/* Hero section with artist info */}
        <div className="artist-hero-card">
          <div className="artist-hero-info">
            <div className="artist-hero-badges">
              <span className="badge-pill badge-primary">Artista</span>
            </div>
            <h2 className="artist-hero-title">Canciones populares</h2>
            <Link href={`/search?artist=${encodeURIComponent(displayArtistName)}`} className="view-all-modern">
              Ver todas las canciones
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* Filter pills */}
        <nav className="filter-pills-row" aria-label="filtrar contenido del artista">
          {pills.map((pill) => (
            <button
              key={pill}
              type="button"
              className={`filter-pill-modern ${activeFilter === pill ? 'is-active' : ''}`}
              onClick={() => setActiveFilter(pill)}
            >
              {pill}
            </button>
          ))}
        </nav>

        {/* Content: songs or repertoires */}
        <div className={`content-scroll-area ${displayedSongs.length === 1 ? 'content-scroll-area--compact' : ''}`}>
          {activeFilter === 'Repertorios' ? (
            <ul className="repertoire-grid-modern" role="list">
              {relevantrepertoires.map((repertoire) => (
                <li key={repertoire.id} className="repertoire-card-modern">
                  <Link href={`/repertoires/${repertoire.id}`} className="repertoire-card-link">
                    <div className="repertoire-card-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">library_music</span>
                    </div>
                    <div className="repertoire-card-content">
                      <strong>{repertoire.title}</strong>
                      <small>por {repertoire.ownerName}</small>
                      <span className="repertoire-count">{repertoire.songIds.length} canciones</span>
                    </div>
                  </Link>
                </li>
              ))}
              {relevantrepertoires.length === 0 ? (
                <li className="empty-state-modern">
                  <span className="material-symbols-outlined" aria-hidden="true">folder_open</span>
                  <p>No hay repertorios públicos con canciones de este artista.</p>
                </li>
              ) : null}
            </ul>
          ) : displayedSongs.length > 0 ? (
            <>
              <ul className="song-list-modern" role="list">
                {displayedSongs.map((song, index) => (
                  <li key={song.id} className="song-row-modern">
                    <span className="song-index">{padNumber(index)}</span>

                    <div className="song-thumbnail">
                      {song.thumbnailUrl ? (
                        <Image src={song.thumbnailUrl} alt="" width={48} height={48} className="song-thumb-img" />
                      ) : (
                        <div className="song-thumb-placeholder" aria-hidden>
                          <span className="material-symbols-outlined" aria-hidden="true">music_note</span>
                        </div>
                      )}
                    </div>

                    <Link href={`/songs/${song.id}`} className="song-title-link">
                      <span className="song-title">{song.title}</span>
                      {song.isVerified && (
                        <span className="verified-icon" title="Verificado">
                          <span className="material-symbols-outlined" aria-hidden="true">verified</span>
                        </span>
                      )}
                    </Link>

                    <div className="song-meta">
                      {canViewStatus && (
                        <span className={`status-badge ${song.reviewStatus === 'reviewed' ? 'status-reviewed' : 'status-pending'}`}>
                          {getSongStatusLabel(song.moderationState)}
                        </span>
                      )}
                      <span className="song-views">{song.views.toLocaleString()} vistas</span>
                      {song.tone && <span className="song-tone">{song.tone}</span>}
                    </div>
                  </li>
                ))}
              </ul>
              {hasMoreSongs && (
                <div className="show-more-section">
                  <button
                    type="button"
                    className="show-more-button"
                    onClick={() => setShowAllSongsModal(true)}
                  >
                    Ver todas las canciones ({songsToRender.length})
                    <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state-modern">
              <span className="material-symbols-outlined" aria-hidden="true">search_off</span>
              <p>
                {activeFilter === 'Partituras'
                  ? 'No hay partituras disponibles para este artista.'
                  : 'No hay canciones con letra disponibles.'}
              </p>
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        {/* {activeFilter !== 'Repertorios' && songsToRender.length > 0 ? (
          <div className="bottom-cta-section">
            <Link href={`/search?artist=${encodeURIComponent(artistData.name)}`} className="cta-button-modern">
              Explorar catálogo completo
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </Link>
          </div>
        ) : null} */}

        {/* Related content sections */}
        {activeFilter !== 'Repertorios' && (
          <>
            {/* Discography section */}
            <section className="discography-section" aria-label="discografía">
              <div className="section-header-modern">
                <h3>Discografía</h3>
                <Link href={`/search?artist=${encodeURIComponent(artistData.name)}`} className="section-link-modern">
                  Ver todo
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                </Link>
              </div>

              <div className="discography-grid-modern">
                {discographyCards.map((album) => (
                  <Link key={album.id} href={album.href} className="album-card-modern">
                    <div className="album-cover-wrapper">
                      {album.coverUrl? (
                        <Image src={album.coverUrl} alt={album.title} width={160} height={120} className="album-cover-img" />
                      ) : (
                        <div className="album-cover-placeholder" aria-hidden>
                          <span>{album.title.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                    <div className="album-info">
                      <strong>{album.title}</strong>
                      <small>{album.year}</small>
                      {canViewStatus && (
                        <span className={`album-status ${album.reviewStatus === 'reviewed' ? 'status-reviewed' : 'status-pending'}`}>
                          {getAlbumStatusLabel(album.moderationState)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Related artists section */}
            <section className="related-artists-section" aria-label="también te puede gustar">
              <div className="section-header-modern">
                <h3>Artistas relacionados</h3>
              </div>

              <div className="related-artists-grid">
                {relatedArtists.map((relatedArtist) => (
                  <Link
                    key={relatedArtist.id}
                    href={getArtistProfileHref({ artistId: relatedArtist.id, artistName: relatedArtist.name })}
                    className="related-artist-card"
                    aria-label={relatedArtist.name}
                  >
                    <div className="related-avatar-wrapper">
                      {relatedArtist.imageUrl ? (
                        <Image src={relatedArtist.imageUrl} alt={relatedArtist.name} width={80} height={80} className="related-avatar-img" unoptimized={relatedArtist.imageUrl.startsWith('http')} />
                      ) : (
                        <div className="related-avatar-placeholder" aria-hidden>
                          <span>{relatedArtist.name.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                    <span className="related-artist-name">{relatedArtist.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
      
      {/* All Songs Modal */}
      {showAllSongsModal && (
        <AllSongsModal
          songs={songsToRender}
          artistName={displayArtistName}
          canViewStatus={canViewStatus}
          onClose={() => setShowAllSongsModal(false)}
        />
      )}
    </div>
  );
}

interface AllSongsModalProps {
  songs: ArtistSongRow[];
  artistName: string;
  canViewStatus: boolean;
  onClose: () => void;
}

function AllSongsModal({ songs, artistName, canViewStatus, onClose }: AllSongsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) {
      return songs;
    }
    const query = searchQuery.toLowerCase();
    return songs.filter((song) => 
      song.title.toLowerCase().includes(query)
    );
  }, [songs, searchQuery]);

  const displayedSongs = filteredSongs.slice(0, visibleCount);
  const hasMore = filteredSongs.length > visibleCount;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !isLoading) {
      setIsLoading(true);
      // Simulate loading delay
      setTimeout(() => {
        setVisibleCount((prev) => prev + 20);
        setIsLoading(false);
      }, 500);
    }
  }, [hasMore, isLoading]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Todas las canciones de {artistName}</h2>
          <button 
            type="button" 
            className="modal-close-button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="modal-search">
          <div className="search-input-wrapper">
            <span className="material-symbols-outlined search-icon">search</span>
            <input
              type="text"
              placeholder="Buscar canciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <span className="material-symbols-outlined">clear</span>
              </button>
            )}
          </div>
        </div>

        <div className="modal-song-list" onScroll={handleScroll}>
          {displayedSongs.length > 0 ? (
            <ul className="song-list-modern">
              {displayedSongs.map((song, index) => (
                <li key={song.id} className="song-row-modern">
                  <span className="song-index">{String(index + 1).padStart(2, '0')}</span>

                  <div className="song-thumbnail">
                    {song.thumbnailUrl ? (
                      <Image src={song.thumbnailUrl} alt="" width={48} height={48} className="song-thumb-img" />
                    ) : (
                      <div className="song-thumb-placeholder" aria-hidden>
                        <span className="material-symbols-outlined" aria-hidden="true">music_note</span>
                      </div>
                    )}
                  </div>

                  <Link href={`/songs/${song.id}`} className="song-title-link">
                    <span className="song-title">{song.title}</span>
                    {song.isVerified && (
                      <span className="verified-icon" title="Verificado">
                        <span className="material-symbols-outlined" aria-hidden="true">verified</span>
                      </span>
                    )}
                  </Link>

                  <div className="song-meta">
                    {canViewStatus && (
                      <span className={`status-badge ${song.reviewStatus === 'reviewed' ? 'status-reviewed' : 'status-pending'}`}>
                        {getSongStatusLabel(song.moderationState)}
                      </span>
                    )}
                    <span className="song-views">{song.views.toLocaleString()} vistas</span>
                    {song.tone && <span className="song-tone">{song.tone}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state-modern">
              <span className="material-symbols-outlined" aria-hidden="true">search_off</span>
              <p>No se encontraron canciones.</p>
            </div>
          )}

          {isLoading && (
            <div className="loading-indicator">
              <SkeletonList count={3} className="artist-modal-skeleton-item" />
            </div>
          )}

          {!hasMore && filteredSongs.length > 0 && (
            <div className="end-of-list">
              <span>Mostrando {filteredSongs.length} canciones</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

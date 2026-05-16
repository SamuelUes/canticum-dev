'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  getArtistDetailById,
  getPublicrepertoiresForArtist,
  loadArtistFavoriteState,
  requestTrackArtistProfileView,
  saveArtistFavoriteState
} from '../../features/artist/repository';
import { getArtistProfileHref } from '../../features/artist/routing';
import type { ArtistDetail, ArtistImage, ArtistrepertoireRef, ArtistSongRow } from '../../types/artist';

function getModerationStateLabel(state?: string): string {
  const normalized = (state ?? '').trim().toUpperCase();
  if (normalized === 'APPROVED') return 'Aprobada';
  if (normalized === 'PUBLISHED') return 'Publicada';
  if (normalized === 'DRAFT') return 'Borrador';
  if (normalized === 'IN_REVIEW') return 'En revisión';
  if (normalized === 'REJECTED') return 'Rechazada';
  return 'Pendiente';
}

function getReviewLabel(reviewStatus?: 'reviewed' | 'pending'): string {
  return reviewStatus === 'reviewed' ? 'Revisada' : 'No revisada';
}

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
  const [activeFilter, setActiveFilter] = useState<FilterPill>('Letra');
  const [favoriteState, setFavoriteState] = useState<{ isFavorite: boolean; likeCount: number }>({
    isFavorite: false,
    likeCount: artist.likeCount
  });
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
    return artistData.discography.slice(0, 5).map((album, index) => ({
      id: album.id || `album-${index}`,
      title: album.title,
      year: album.year,
      coverUrl: album.coverUrl,
      moderationState: album.moderationState,
      reviewStatus: album.reviewStatus,
      href: album.albumId
        ? `/albums/${album.albumId}`
        : album.songId
          ? `/songs/${album.songId}`
          : `/search?artist=${encodeURIComponent(displayArtistName)}`
    }));
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
      return filteredSongs;
    }

    if (activeFilter === 'Letra' || activeFilter === 'Partituras') {
      return artistData.songs;
    }

    return [] as ArtistSongRow[];
  }, [activeFilter, filteredSongs, artistData.songs]);

  const metricGenreLabel = useMemo(() => {
    const genres = Array.isArray(artistData.genres)
      ? artistData.genres
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
      : [];

    return genres.slice(0, 2).join(' / ') || artistData.ministryType || 'General';
  }, [artistData.genres, artistData.ministryType]);

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
    <div className="artist-profile-layout">
      {/* ── Left sidebar ── */}
      <aside className="artist-sidebar">
        <div className="artist-avatar-wrap">
          {avatarSrc ? (
            <Image src={avatarSrc} alt={displayArtistName} width={60} height={60} className="artist-avatar-img" />
          ) : (
            <div className="artist-avatar-placeholder" aria-hidden>
              <span>{displayArtistName.charAt(0)}</span>
            </div>
          )}
        </div>

        <h1 className="artist-sidebar-name">{displayArtistName}</h1>

        <div className="artist-sidebar-actions">
          <div className="artist-action-control">
            <button
              type="button"
              className={favoriteState.isFavorite ? 'artist-action-btn artist-action-btn--favorite is-active' : 'artist-action-btn artist-action-btn--favorite'}
              aria-label={favoriteState.isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}
              onClick={handleToggleFavorite}
              disabled={isFavoritePending}
            >
              <Image src="/assets/utils/heart/heart2x.png" alt="" width={20} height={20} />
            </button>
            <span className="artist-action-label">{favoriteState.isFavorite ? 'En Favoritos' : 'Agregar a Favoritos'}</span>
          </div>
          <div className="artist-action-control">
            <button type="button" className="artist-action-btn" aria-label="Compartir">
              <Image src="/assets/utils/iconshare-social/iconshare2x.png" alt="" width={20} height={20} />
              
            </button>
            <span className="artist-action-label">Compartir</span>
          </div>
          {/* <button type="button" className="artist-action-btn" aria-label="Enviar acordes">
            <Image src="/assets/utils/volumeup/volumeup2x.png" alt="" width={20} height={20} />
            <span>Enviar acordes</span>
          </button> */}
          
        </div>
      </aside>

      {/* ── Main content ── */}
      <section className="artist-main">
        <header className="artist-main-head">
          <h2>Canciones populares</h2>
          <Link href={`/search?artist=${encodeURIComponent(displayArtistName)}`} className="artist-see-more more-pill-link">
            Ver más &rsaquo;
          </Link>
        </header>

        {/* pill filters */}
        <nav className="artist-pills" aria-label="filtrar contenido del artista">
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

        {/* songs / repertoires */}
        {activeFilter === 'Repertorios' ? (
          <ul className="artist-repertoire-list" role="list">
            {relevantrepertoires.map((repertoire) => (
              <li key={repertoire.id} className="artist-repertoire-card">
                <Link href={`/repertoires/${repertoire.id}`} className="artist-repertoire-link">
                  <strong>{repertoire.title}</strong>
                  <small>por {repertoire.ownerName}</small>
                  <small>{repertoire.songIds.length} canciones</small>
                </Link>
              </li>
            ))}
            {relevantrepertoires.length === 0 ? (
              <li className="artist-repertoire-card artist-empty-row">
                <span>No hay repertorios públicos que contengan canciones de este artista.</span>
              </li>
            ) : null}
          </ul>
        ) : songsToRender.length > 0 ? (
          <ul className="artist-song-list" role="list">
            {songsToRender.map((song, index) => (
              <li key={song.id} className="artist-song-row">
                <span className="artist-col-num">{padNumber(index)}</span>

                <span className="artist-col-thumb">
                  {song.thumbnailUrl ? (
                    <Image src={song.thumbnailUrl} alt="" width={36} height={36} className="artist-song-thumb" />
                  ) : (
                    <span className="artist-song-thumb-placeholder" aria-hidden />
                  )}
                </span>

                <Link href={`/songs/${song.id}`} className="artist-col-song">
                  {song.title}
                  {song.isVerified ? <span className="artist-verified-badge" title="Verificado">✔</span> : null}
                </Link>

                <span className={`artist-col-status artist-status-chip ${song.reviewStatus === 'reviewed' ? 'is-reviewed' : 'is-pending'}`}>
                  {getModerationStateLabel(song.moderationState)} · {getReviewLabel(song.reviewStatus)}
                </span>
                <span className="artist-col-views">{song.views.toLocaleString()}</span>
                <span className="artist-col-tone">{song.tone}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="artist-empty-state">
            {activeFilter === 'Partituras'
              ? 'No hay partituras disponibles para este artista.'
              : 'No hay canciones con letra disponibles.'}
          </p>
        )}

        {/* bottom "Ver más" */}
        {activeFilter !== 'Repertorios' && songsToRender.length > 0 ? (
          <div className="artist-bottom-more">
            <Link href={`/search?artist=${encodeURIComponent(artistData.name)}`} className="artist-see-more more-pill-link">
              Ver más &rsaquo;
            </Link>
          </div>
        ) : null}

        {activeFilter !== 'Repertorios' ? (
          <>
            <section className="artist-extra-section" aria-label="discografía">
              <header className="artist-main-head artist-main-head--compact">
                <h2>Discografía</h2>
                <Link href={`/search?artist=${encodeURIComponent(artistData.name)}`} className="artist-see-more more-pill-link">
                  Ver más &rsaquo;
                </Link>
              </header>

              <div className="artist-discography-grid">
                {discographyCards.map((album) => (
                  <Link key={album.id} href={album.href} className="artist-album-card">
                    {album.coverUrl ? (
                      <Image src={album.coverUrl} alt={album.title} width={140} height={110} className="artist-album-cover" />
                    ) : (
                      <div className="artist-album-cover artist-album-cover--placeholder" aria-hidden>
                        <span>{album.title.charAt(0)}</span>
                      </div>
                    )}
                    <strong>{album.title}</strong>
                    <small>{album.year} • Álbum</small>
                    <small className={`artist-status-chip ${album.reviewStatus === 'reviewed' ? 'is-reviewed' : 'is-pending'}`}>
                      {getModerationStateLabel(album.moderationState)} · {getReviewLabel(album.reviewStatus)}
                    </small>
                  </Link>
                ))}
              </div>
            </section>

            <section className="artist-extra-section" aria-label="también te puede gustar">
              <header className="artist-main-head artist-main-head--compact">
                <h2>También te puede gustar</h2>
              </header>

              <div className="artist-related-row">
                {relatedArtists.map((relatedArtist) => (
                  <Link
                    key={relatedArtist.id}
                    href={getArtistProfileHref({ artistId: relatedArtist.id, artistName: relatedArtist.name })}
                    className="artist-related-item"
                    aria-label={relatedArtist.name}
                  >
                    {relatedArtist.imageUrl ? (
                      <Image src={relatedArtist.imageUrl} alt={relatedArtist.name} width={108} height={108} className="artist-related-avatar artist-related-avatar--img" unoptimized={relatedArtist.imageUrl.startsWith('http')} />
                    ) : (
                      <div className="artist-related-avatar" aria-hidden>
                        <span>{relatedArtist.name.charAt(0)}</span>
                      </div>
                    )}
                    <span>{relatedArtist.name}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="artist-metrics-band" aria-label="estadísticas del artista">
              <article className="artist-metric artist-metric--fans">
                <strong>{fanCount.toLocaleString()}</strong>
                <small>Fans estimados</small>
              </article>
              <article className="artist-metric">
                <strong>{totalViews.toLocaleString()}</strong>
                <small>Visualizaciones</small>
              </article>
              <article className="artist-metric">
                <strong>{metricGenreLabel}</strong>
                <small>Género / estilo</small>
              </article>
            </section>
          </>
        ) : null}
      </section>
    </div>
  );
}

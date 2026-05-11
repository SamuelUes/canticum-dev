'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
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
  const pills: FilterPill[] = ['Letra', 'Partituras', 'Repertorios'];

  const totalViews = artist.totalViews;
  const avatarSrc = pickImage(artist.images, 160, artist.imageUrl);

  const discographyCards = useMemo(() => {
    return artist.discography.slice(0, 5).map((album, index) => ({
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
          : `/search?artist=${encodeURIComponent(artist.name)}`
    }));
  }, [artist.discography, artist.name]);

  const relatedArtists = useMemo(() => {
    return artist.suggestedArtists
      .filter((item) => item.name.toLowerCase() !== artist.name.toLowerCase())
      .slice(0, 5)
      .map((item, index) => ({
        id: item.id || `related-${index}`,
        name: item.name,
        imageUrl: pickImage(item.images, 160, item.imageUrl)
      }));
  }, [artist.name, artist.suggestedArtists]);

  const fanCount = artist.followers?.total ?? artist.likeCount;

  const filteredSongs: ArtistSongRow[] = useMemo(() => {
    if (activeFilter === 'Letra') {
      return artist.songs.filter((song) => song.hasLyrics);
    }

    if (activeFilter === 'Partituras') {
      return artist.songs.filter((song) => song.hasSheet);
    }

    return [];
  }, [activeFilter, artist.songs]);

  const relevantrepertoires: ArtistrepertoireRef[] = useMemo(() => {
    if (activeFilter !== 'Repertorios') {
      return [];
    }

    const artistSongIdSet = new Set(artist.songs.map((song) => song.id));
    return repertoires.filter((repertoire) =>
      repertoire.songIds.some((songId) => artistSongIdSet.has(songId))
    );
  }, [activeFilter, artist.songs, repertoires]);

  const padNumber = (index: number): string => String(index + 1).padStart(2, '0');

  return (
    <div className="artist-profile-layout">
      {/* ── Left sidebar ── */}
      <aside className="artist-sidebar">
        <div className="artist-avatar-wrap">
          {avatarSrc ? (
            <Image src={avatarSrc} alt={artist.name} width={60} height={60} className="artist-avatar-img" />
          ) : (
            <div className="artist-avatar-placeholder" aria-hidden>
              <span>{artist.name.charAt(0)}</span>
            </div>
          )}
        </div>

        <h1 className="artist-sidebar-name">{artist.name}</h1>

        <div className="artist-sidebar-actions">
          <button type="button" className="artist-action-btn" aria-label="Agregar a Favoritos">
            <Image src="/assets/utils/heart/heart2x.png" alt="" width={20} height={20} />
            <span>Agregar a Favoritos</span>
          </button>
          <button type="button" className="artist-action-btn" aria-label="Compartir">
            <Image src="/assets/utils/iconshare-social/iconshare2x.png" alt="" width={20} height={20} />
            <span>Compartir</span>
          </button>
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
          <Link href={`/search?artist=${encodeURIComponent(artist.name)}`} className="artist-see-more more-pill-link">
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

        {/* ── Songs table (Letra / Partituras) ── */}
        {activeFilter !== 'Repertorios' ? (
          <>
            <div className="artist-table-head">
              <span className="artist-col-num" />
              <span className="artist-col-thumb" />
              <span className="artist-col-song">Canción</span>
              <span className="artist-col-status">Estado</span>
              <span className="artist-col-views">Visualizaciones</span>
              <span className="artist-col-tone">Tono</span>
            </div>

            <ul className="artist-song-list" role="list">
              {filteredSongs.map((song, index) => (
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

              {filteredSongs.length === 0 ? (
                <li className="artist-song-row artist-empty-row">
                  <span>No hay canciones con {activeFilter.toLowerCase()} disponibles.</span>
                </li>
              ) : null}
            </ul>
          </>
        ) : null}

        {/* ── repertoires grid ── */}
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
        ) : null}

        {/* bottom "Ver más" */}
        {activeFilter !== 'Repertorios' && filteredSongs.length > 0 ? (
          <div className="artist-bottom-more">
            <Link href={`/search?artist=${encodeURIComponent(artist.name)}`} className="artist-see-more more-pill-link">
              Ver más &rsaquo;
            </Link>
          </div>
        ) : null}

        {activeFilter !== 'Repertorios' ? (
          <>
            <section className="artist-extra-section" aria-label="discografía">
              <header className="artist-main-head artist-main-head--compact">
                <h2>Discografía</h2>
                <Link href={`/search?artist=${encodeURIComponent(artist.name)}`} className="artist-see-more more-pill-link">
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
                <strong>{artist.genres.slice(0, 2).join(' / ') || artist.ministryType || 'General'}</strong>
                <small>Género / estilo</small>
              </article>
            </section>
          </>
        ) : null}
      </section>
    </div>
  );
}

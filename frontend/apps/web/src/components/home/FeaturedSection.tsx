import Image from 'next/image';
import Link from 'next/link';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import { SkeletonCard, SkeletonTitle } from '../ui/skeleton';
import type { FeaturedAlbumCardData, FeaturedSongCardData, HomeText } from '../../types/home';

function formatDuration(ms?: number): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface FeaturedSectionProps {
  title: HomeText['featuredTitle'];
  songs: FeaturedSongCardData[];
  albums?: FeaturedAlbumCardData[];
  loading?: boolean;
}

export function FeaturedSection({ title, songs, albums = [], loading = false }: FeaturedSectionProps) {
  if (loading) {
    return (
      <section className="home-section layout-h-margin" aria-busy>
        <SkeletonTitle />
        <div className="home-skeleton-grid">
          <SkeletonCard count={4} />
        </div>
      </section>
    );
  }

  const hasContent = songs.length > 0 || albums.length > 0;
  if (!hasContent) {
    return null;
  }

  return (
    <section className="home-section layout-h-margin">
      <div className="section-headline section-headline--featured">
        <div>
          <span className="section-kicker">Popular ahora</span>
          <h2>{title}</h2>
        </div>
        <Link href="/search" className="view-all-link featured-view-link">
          Ver todas
        </Link>
      </div>
      <HorizontalConveyor ariaLabel={title} className="featured-conveyor">
        <div className="featured-grid" role="list" aria-label={title}>
          {songs.map((song, index) => (
            <Link key={song.id} href={`/songs/${song.id}`} className="song-card featured" role="listitem">
              {song.imageUrl ? (
                <div className="song-thumb-image-wrap" role="link">
                  <Image
                    src={song.imageUrl}
                    alt={song.title}
                    fill
                    className="song-thumb-image"
                    sizes="(max-width: 768px) 78vw, (max-width: 1200px) 24vw, 300px"
                    priority={index === 0}
                    role="link"
                  />
                </div>
              ) : (
                <div className="song-thumb" />
              )}
              {song.isPremium ? <span className="song-premium-badge">Premium</span> : null}
              <div className="song-card-body">
                <strong>{song.title}</strong>
                <small>{song.subtitle}</small>
              </div>
              {(() => {
                const duration = formatDuration(song.durationMs);
                return duration ? (
                  <div className="song-card-meta" aria-hidden="true">
                    <span className="song-card-duration">{duration}</span>
                    <span className="song-play-button">
                      <span className="material-symbols-outlined">play_arrow</span>
                    </span>
                  </div>
                ) : (
                  <div className="song-card-meta" aria-hidden="true">
                    <span className="song-play-button">
                      <span className="material-symbols-outlined">play_arrow</span>
                    </span>
                  </div>
                );
              })()}
            </Link>
          ))}
        </div>
      </HorizontalConveyor>
      {albums.length > 0 && (
        <>
          <div className="section-headline section-headline--albums">
            <div>
              <span className="section-kicker">Destacados</span>
              <h2>Álbumes</h2>
            </div>
            <Link href="/search?kind=album" className="view-all-link featured-view-link">
              Ver todos
            </Link>
          </div>
          <HorizontalConveyor ariaLabel="Álbumes destacados" className="album-conveyor">
            {albums.map((album, index) => (
              <Link
                key={`album-${album.id}`}
                href={`/albums/album_${album.id}`}
                className="album-card-featured"
                role="listitem"
              >
                <div className="album-cover-wrap">
                  {album.coverUrl ? (
                    <Image
                      src={album.coverUrl}
                      alt={album.title}
                      fill
                      className="album-cover-image"
                      sizes="(max-width: 768px) 42vw, (max-width: 1200px) 20vw, 260px"
                      priority={songs.length === 0 && index === 0}
                    />
                  ) : (
                    <div className="album-cover-placeholder">
                      <span className="material-symbols-outlined">album</span>
                    </div>
                  )}
                  <div className="album-cover-shade" aria-hidden="true" />
                  {/* <span className="album-type-badge">
                    {album.albumType ?? 'Álbum'}
                  </span> */}
                  <div className="album-cover-overlay" aria-hidden="true">
                    <span className="album-play-icon">
                      <span className="material-symbols-outlined">play_arrow</span>
                    </span>
                  </div>
                  <div className="album-card-body">
                    <strong className="album-card-title">{album.title}</strong>
                    <small className="album-card-subtitle">{album.subtitle}</small>
                    <div className="album-card-meta">
                      {album.releaseYear != null && (
                        <span className="album-card-year">{album.releaseYear}</span>
                      )}
                      {album.totalTracks != null && (
                        <span className="album-card-tracks">{album.totalTracks} pistas</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </HorizontalConveyor>
        </>
      )}
    </section>
  );
}

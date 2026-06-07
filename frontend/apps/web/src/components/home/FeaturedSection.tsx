import Image from 'next/image';
import Link from 'next/link';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import { SkeletonCard, SkeletonTitle } from '../ui/skeleton';
import type { FeaturedSongCardData, HomeText } from '../../types/home';

interface FeaturedSectionProps {
  title: HomeText['featuredTitle'];
  songs: FeaturedSongCardData[];
  loading?: boolean;
}

export function FeaturedSection({ title, songs, loading = false }: FeaturedSectionProps) {
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

  if (songs.length === 0) {
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
            </Link>
          ))}
        </div>
      </HorizontalConveyor>
    </section>
  );
}

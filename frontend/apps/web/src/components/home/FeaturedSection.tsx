import Image from 'next/image';
import Link from 'next/link';
import Skeleton from 'react-loading-skeleton';
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
        <Skeleton className="home-skeleton-title" />
        <div className="home-skeleton-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="home-skeleton-card" />
          ))}
        </div>
      </section>
    );
  }

  if (songs.length === 0) {
    return null;
  }

  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>
      <div className="featured-grid">
        {songs.map((song, index) => (
          <Link key={song.id} href={`/songs/${song.id}`} className="song-card">
            {song.imageUrl ? (
              <div className="song-thumb-image-wrap">
                <Image
                  src={song.imageUrl}
                  alt={song.title}
                  fill
                  className="song-thumb-image"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 24vw, 300px"
                  priority={index === 0}
                />
              </div>
            ) : (
              <div className="song-thumb" />
            )}
            <div className="song-card-body">
              <strong>{song.title}</strong>
              <small>{song.subtitle}</small>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

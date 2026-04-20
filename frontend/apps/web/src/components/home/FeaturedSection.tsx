import Image from 'next/image';
import Link from 'next/link';
import type { FeaturedSongCardData, HomeText } from '../../types/home';

interface FeaturedSectionProps {
  title: HomeText['featuredTitle'];
  songs: FeaturedSongCardData[];
}

export function FeaturedSection({ title, songs }: FeaturedSectionProps) {
  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>
      <div className="featured-grid">
        {songs.map((song) => (
          <Link key={song.id} href={`/songs/${song.id}`} className="song-card">
            {song.imageUrl ? (
              <Image src={song.imageUrl} alt={song.title} className="song-thumb-image" width={300} height={92} />
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

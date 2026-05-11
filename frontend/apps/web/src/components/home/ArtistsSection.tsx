'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { getArtistProfileHref } from '../../features/artist/routing';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import type { ArtistData, HomeText } from '../../types/home';

interface ArtistsSectionProps {
  title: HomeText['artistsTitle'];
  artists: ArtistData[];
  loading?: boolean;
}

export function ArtistsSection({ title, artists, loading = false }: ArtistsSectionProps) {
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);

  if (loading) {
    return (
      <section className="home-section layout-h-margin" aria-busy>
        <div className="skeleton-pulse home-skeleton-title" />
        <div className="home-skeleton-row">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton-pulse home-skeleton-pill" />
          ))}
        </div>
      </section>
    );
  }

  if (artists.length === 0) {
    return null;
  }

  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>
      <HorizontalConveyor ariaLabel={title} className="artists-conveyor" scrollStep={260}>
        <div className="artists-track" role="listbox" aria-label={title}>
          {artists.map((artist) => {
            const isSelected = selectedArtistId === artist.id;
            const artistHref = getArtistProfileHref({ artistId: artist.id, artistName: artist.name });

            return (
              <Link
                key={artist.id}
                role="option"
                aria-label={artist.name}
                aria-selected={isSelected}
                className={isSelected ? 'artist-home-pill artist-card-interactive is-selected' : 'artist-home-pill artist-card-interactive'}
                href={artistHref}
                onFocus={() => setSelectedArtistId(artist.id)}
                onMouseEnter={() => setSelectedArtistId(artist.id)}
                onClick={() => setSelectedArtistId(artist.id)}
              >
                {artist.avatarUrl ? (
                  <Image src={artist.avatarUrl} alt={artist.name} className="artist-avatar-image" width={62} height={62} />
                ) : (
                  <div className="artist-avatar">
                    <Image
                      src="/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png"
                      alt="Artista"
                      width={86}
                      height={86}
                      className="placeholder-icon"
                    />
                  </div>
                )}
                <small className="artist-name">{artist.name}</small>
              </Link>
            );
          })}
        </div>
      </HorizontalConveyor>
    </section>
  );
}

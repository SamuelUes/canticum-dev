'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getArtistProfileHref } from '../../features/artist/routing';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import type { ArtistData, HomeText } from '../../types/home';

interface ArtistsSectionProps {
  title: HomeText['artistsTitle'];
  artists: ArtistData[];
}

export function ArtistsSection({ title, artists }: ArtistsSectionProps) {
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <section className="home-section layout-h-margin">
      <h2>{title}</h2>
      <HorizontalConveyor ariaLabel={title} className="artists-conveyor" scrollStep={260}>
        <div className="artists-track" role="listbox" aria-label={title}>
          {artists.map((artist) => {
            const isSelected = selectedArtistId === artist.id;

            return (
              <article
                key={artist.id}
                role="option"
                aria-label={artist.name}
                aria-selected={isSelected}
                tabIndex={0}
                className={isSelected ? 'artist-home-pill artist-card-interactive is-selected' : 'artist-home-pill artist-card-interactive'}
                onClick={() => {
                  setSelectedArtistId(artist.id);
                  router.push(getArtistProfileHref({ artistId: artist.id, artistName: artist.name }));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedArtistId(artist.id);
                    router.push(getArtistProfileHref({ artistId: artist.id, artistName: artist.name }));
                  }
                }}
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
              </article>
            );
          })}
        </div>
      </HorizontalConveyor>
    </section>
  );
}

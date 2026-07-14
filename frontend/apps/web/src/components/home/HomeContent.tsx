'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchHomeData, getCachedHomeData, type HomeData } from '../../features/home/repository';
import type { ArtistData, FeaturedAlbumCardData, FeaturedSongCardData, HomeText, ListItemData } from '../../types/home';
import { ArtistsSection } from './ArtistsSection';
import { DualListSection } from './DualListSection';
import { FeaturedSection } from './FeaturedSection';
import { MySection } from './mySection';
import { getArtistProfileHref } from '../../features/artist/routing';

const EMPTY_HOME_DATA: HomeData = {
  featuredSongs: [],
  featuredAlbums: [],
  recentSongs: [],
  artists: [],
  trends: [],
  ownSongs: [],
  ownRepertoires: [],
  categories: [],
  newsletterSlides: [],
  misales: [],
  sundaySchema: null
};

interface HomeContentProps {
  text: HomeText;
  onAvailableCategoriesChange?: (categories: string[]) => void;
}

export function HomeContent({
  text,
  onAvailableCategoriesChange
}: HomeContentProps) {
  const { user, loading: authLoading } = useAuth();
  const [homeData, setHomeData] = useState<HomeData>(() => getCachedHomeData() ?? EMPTY_HOME_DATA);
  const [loading, setLoading] = useState(() => !getCachedHomeData());
  const currentUserId = user?.uid ?? null;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    const hydrate = async () => {
      const cached = getCachedHomeData();
      if (!disposed && cached) {
        setHomeData(cached);
        setLoading(false);
      } else if (!disposed) {
        setLoading(true);
      }

      try {
        const resolved = await fetchHomeData();
        if (disposed) return;
        setHomeData(resolved);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [authLoading, currentUserId]);

  useEffect(() => {
    if (!onAvailableCategoriesChange) {
      return;
    }

    onAvailableCategoriesChange(homeData.categories);
  }, [homeData.categories, onAvailableCategoriesChange]);

  const featuredSongs: FeaturedSongCardData[] = homeData.featuredSongs.map((song) => ({
    id: song.id,
    title: song.title,
    subtitle: song.subtitle,
    imageUrl: song.imageUrl,
    isPremium: song.isPremium,
    durationMs: song.durationMs
  }));

  const featuredAlbums: FeaturedAlbumCardData[] = homeData.featuredAlbums.map((album) => ({
    id: album.id,
    title: album.title,
    subtitle: album.subtitle,
    coverUrl: album.coverUrl,
    albumType: album.albumType,
    releaseYear: album.releaseYear,
    totalTracks: album.totalTracks,
    popularity: album.popularity
  }));

  const artists: ArtistData[] = homeData.artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    avatarUrl: artist.avatarUrl
  }));

  const trends: ListItemData[] = homeData.trends.map((trend) => ({
    id: trend.id,
    title: trend.title,
    subtitle: trend.subtitle,
    avatarUrl: trend.avatarUrl,
    rankDelta: trend.rankDelta,
    score: trend.score
  }));

  const recentSongs: ListItemData[] = homeData.recentSongs.map((song) => ({
    id: song.id,
    title: song.title,
    subtitle: song.subtitle,
    avatarUrl: song.avatarUrl
  }));

  const ownSongs = currentUserId ? homeData.ownSongs : [];
  const ownRepertoires = currentUserId ? homeData.ownRepertoires : [];

  return (
    <>
      <FeaturedSection title={text.featuredTitle} songs={featuredSongs} albums={featuredAlbums} loading={loading} />

      {!loading && currentUserId ? (
        <MySection songs={ownSongs as never} repertoires={ownRepertoires as never} />
      ) : null}

      <ArtistsSection title={text.artistsTitle} artists={artists} loading={loading} />

      <DualListSection
        loading={loading}
        left={{
          title: text.trendsTitle,
          viewAllLabel: text.viewAll,
          viewAllHref: '/search?kind=artist',
          items: trends,
          variant: 'trends',
          resolveItemHref: (item) =>
            getArtistProfileHref({
              artistId: item.id,
              artistName: item.title
            })
        }}
        right={{
          title: text.recentTitle,
          viewAllLabel: text.viewAll,
          viewAllHref: '/search?kind=song',
          items: recentSongs,
          linkBasePath: '/songs',
          variant: 'recent'
        }}
      />
    </>
  );
}

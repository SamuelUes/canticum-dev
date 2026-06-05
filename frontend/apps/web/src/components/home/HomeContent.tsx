'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCachedSearchDatasetClient, getSearchDatasetClient } from '../../features/search/repository';
import type {
  SearchDataset,
  SearchEntityItem,
  SearchrepertoireItem,
  SearchSongItem
} from '../../types/search';
import type { ArtistData, FeaturedSongCardData, HomeText, ListItemData } from '../../types/home';
import { ArtistsSection } from './ArtistsSection';
import { DualListSection } from './DualListSection';
import { FeaturedSection } from './FeaturedSection';
import { MySection } from './mySection';
import { getArtistProfileHref } from '../../features/artist/routing';

interface HomeContentProps {
  text: HomeText;
  selectedCategory?: string;
  onAvailableCategoriesChange?: (categories: string[]) => void;
}

function pickImage(item: SearchEntityItem): string | undefined {
  return item.images && item.images.length > 0 ? item.images[0]?.url : undefined;
}

function timestampOf(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveArtistDisplayName(item: SearchEntityItem): string {
  const candidates = [item.title, item.authorOrChoir]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (candidates.length === 0) {
    return 'Artista';
  }

  if (candidates[0].toLowerCase() === 'artista' && candidates[1]) {
    return candidates[1];
  }

  return candidates[0];
}

function resolveArtistDisplaySubtitle(item: SearchEntityItem): string {
  const raw = item.subtitle.trim();
  if (!raw) {
    return 'General';
  }

  if (raw.toLowerCase() === 'unknown') {
    return 'General';
  }

  return raw;
}

function songToFeaturedCard(song: SearchSongItem): FeaturedSongCardData {
  return {
    id: song.songId ?? song.id,
    title: song.title,
    subtitle: song.subtitle || song.authorOrChoir,
    imageUrl: pickImage(song),
    isPremium: song.isPremium
  };
}

function songToListItem(song: SearchSongItem): ListItemData {
  return {
    id: song.songId ?? song.id,
    title: song.title,
    subtitle: song.subtitle || song.authorOrChoir,
    avatarUrl: pickImage(song)
  };
}

export function HomeContent({
  text,
  selectedCategory = 'todos',
  onAvailableCategoriesChange
}: HomeContentProps) {
  const { user, loading: authLoading } = useAuth();
  const [dataset, setDataset] = useState<SearchDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserId = user?.uid ?? null;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    const hydrate = async () => {
      const cached = getCachedSearchDatasetClient('home');
      if (!disposed && cached) {
        setDataset(cached);
        setLoading(false);
      } else if (!disposed) {
        setLoading(true);
      }

      try {
        const resolvedDataset = await getSearchDatasetClient({
          scope: 'home',
          category: selectedCategory === 'todos' ? '' : selectedCategory,
          signal: controller.signal
        });
        if (disposed) return;
        setDataset(resolvedDataset);
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
  }, [authLoading, currentUserId, selectedCategory]);

  useEffect(() => {
    if (!onAvailableCategoriesChange) {
      return;
    }

    if (!dataset) {
      onAvailableCategoriesChange([]);
      return;
    }

    const categories = dataset.filters.categories
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    onAvailableCategoriesChange(Array.from(new Set(categories)));
  }, [dataset, onAvailableCategoriesChange]);

  const songs = useMemo<SearchSongItem[]>(() => {
    if (!dataset) return [];
    return dataset.items.filter((item): item is SearchSongItem => item.kind === 'song');
  }, [dataset]);

  const repertoires = useMemo<SearchrepertoireItem[]>(() => {
    if (!dataset) return [];
    return dataset.items.filter((item): item is SearchrepertoireItem => item.kind === 'repertoire');
  }, [dataset]);

  const artists = useMemo<ArtistData[]>(() => {
    if (!dataset) return [];
    return dataset.items
      .filter((item) => item.kind === 'artist')
      .slice(0, 24)
      .map((item) => ({
        id: item.artistId ?? item.id,
        name: resolveArtistDisplayName(item),
        avatarUrl: pickImage(item)
      }));
  }, [dataset]);

  const featuredSongs = useMemo<FeaturedSongCardData[]>(() => {
    if (songs.length === 0) return [];
    const ranked = [...songs].sort((a, b) => {
      const popDelta = (b.popularity ?? 0) - (a.popularity ?? 0);
      if (popDelta !== 0) return popDelta;
      const likesDelta = (b.likeCount ?? 0) - (a.likeCount ?? 0);
      if (likesDelta !== 0) return likesDelta;
      const viewsDelta = (b.totalViews ?? 0) - (a.totalViews ?? 0);
      if (viewsDelta !== 0) return viewsDelta;
      return timestampOf(b.publishedAt ?? b.createdAt) - timestampOf(a.publishedAt ?? a.createdAt);
    });
    // Only public/published songs (those that don't have draft owner-only flag) are returned by /search/catalog
    return ranked.filter((song) => !currentUserId || song.ownerUserId !== currentUserId).slice(0, 4).map(songToFeaturedCard);
  }, [songs, currentUserId]);

  const trends = useMemo<ListItemData[]>(() => {
    // "Tendencias" → top artistas con más canciones publicadas
    if (!dataset) return [];
    return dataset.items
      .filter((item) => item.kind === 'artist')
      .slice(0, 6)
      .map((item) => ({
        id: item.artistId ?? item.id,
        title: resolveArtistDisplayName(item),
        subtitle: resolveArtistDisplaySubtitle(item),
        avatarUrl: pickImage(item)
      }));
  }, [dataset]);

  const recentSongs = useMemo<ListItemData[]>(() => {
    return [...songs]
      .sort((a, b) => timestampOf(b.publishedAt ?? b.createdAt) - timestampOf(a.publishedAt ?? a.createdAt))
      .slice(0, 6)
      .map(songToListItem);
  }, [songs]);

  const ownSongs = useMemo<SearchSongItem[]>(() => {
    if (!currentUserId) return [];
    return songs.filter((song) => song.ownerUserId === currentUserId);
  }, [songs, currentUserId]);

  const ownRepertoires = useMemo<SearchrepertoireItem[]>(() => {
    if (!currentUserId) return [];
    return repertoires.filter((repertoire) => repertoire.ownerUserId === currentUserId);
  }, [repertoires, currentUserId]);

  return (
    <>
      <FeaturedSection title={text.featuredTitle} songs={featuredSongs} loading={loading} />

      {!loading && currentUserId ? (
        <MySection songs={ownSongs} repertoires={ownRepertoires} />
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

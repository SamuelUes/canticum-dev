'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArtistProfileHref } from '../../features/artist/routing';
import { getClientCurrentUserId, getSearchDatasetClient } from '../../features/search/repository';
import { requestDeleterepertoire, loadRepertoireBookmark, saveRepertoireBookmark } from '../../features/repertoire/clientPersistence';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import { LoadingBubble } from '../ui/LoadingBubble';
import { SkeletonCard, SkeletonTitle } from '../ui/skeleton';
import type { SearchAlbumItem, SearchDataset, SearchEntityItem, SearchEntityKind, SearchrepertoireItem, SearchSongItem, SearchVersionItem } from '../../types/search';

const kindLabels: Record<SearchEntityKind, string> = {
  song: 'Canciones',
  album: 'Álbumes',
  repertoire: 'Repertorios',
  artist: 'Artistas',
  version: 'Versiones'
};

const KIND_ORDER: SearchEntityKind[] = ['song', 'album', 'repertoire', 'artist', 'version'];

type SortOption = 'relevance' | 'popular' | 'alpha' | 'recent';

const sortLabels: Record<SortOption, string> = {
  relevance: 'Relevancia',
  popular: 'Más populares',
  alpha: 'A–Z',
  recent: 'Más recientes'
};

const FILTER_COLLAPSE_THRESHOLD = 7;
const DEBOUNCE_MS = 250;

const DURATION_BUCKETS = [
  { value: 'short', label: '< 2 min', max: 120_000 },
  { value: 'medium', label: '2–4 min', max: 240_000 },
  { value: 'long', label: '> 4 min', max: Infinity }
] as const;

type DurationBucket = typeof DURATION_BUCKETS[number]['value'];

const REPERTOIRE_VISIBILITY_OPTIONS = [
  { value: 'mine', label: 'Mis repertorios' },
  { value: 'public', label: 'Públicos' }
] as const;

type RepertoireVisibility = typeof REPERTOIRE_VISIBILITY_OPTIONS[number]['value'];

const RECENT_SEARCHES_KEY = 'canticum:recent-searches';
const MAX_RECENT_SEARCHES = 8;
const LITURGICAL_SEASONS: { month: number; season: string }[] = [
  { month: 0, season: 'Navidad' },      // Jan
  { month: 1, season: 'Ordinario' },
  { month: 2, season: 'Cuaresma' },     // Mar (approx)
  { month: 3, season: 'Cuaresma' },
  { month: 4, season: 'Pascua' },       // May (approx)
  { month: 5, season: 'Ordinario' },
  { month: 11, season: 'Adviento' }     // Dec
];

function getCurrentLiturgicalSeason(): string | null {
  const now = new Date();
  const month = now.getMonth();
  const match = LITURGICAL_SEASONS.find((s) => s.month === month);
  return match?.season ?? null;
}

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string) {
  if (typeof window === 'undefined') return;
  const trimmed = term.trim();
  if (!trimmed) return;
  const existing = getRecentSearches();
  const filtered = existing.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
  }
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function findClosestMatches(query: string, items: SearchEntityItem[], maxResults = 3): SearchEntityItem[] {
  if (!query.trim()) return [];
  const nq = normalize(query);
  const scored = items.map((item) => {
    const titleDist = levenshtein(nq, normalize(item.title).slice(0, nq.length + 5));
    const textDist = levenshtein(nq, normalize(item.searchableText).slice(0, nq.length + 10));
    const score = Math.min(titleDist, textDist);
    return { item, score };
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, maxResults).map((s) => s.item);
}

interface FilterPreset {
  id: string;
  label: string;
  icon: string;
  apply: () => void;
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function parseBooleanParam(value: string | null): boolean {
  return value === '1' || value === 'true';
}

interface SearchExplorerProps {
  initialQuery?: string;
  initialCategory?: string;
  /** Optional initial dataset (e.g. SSR). When omitted, the explorer renders a skeleton until the client fetch resolves. */
  dataset?: SearchDataset;
}

const EMPTY_DATASET: SearchDataset = {
  filters: { liturgicalTypes: [], liturgicalTimes: [], authorOrChoirs: [], categories: [] },
  items: []
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseKindsFromQuery(rawKinds: string | null): SearchEntityKind[] {
  if (!rawKinds) {
    return [...KIND_ORDER];
  }

  const parsedKinds = rawKinds
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is SearchEntityKind => KIND_ORDER.includes(item as SearchEntityKind));

  if (parsedKinds.length === 0) {
    return [...KIND_ORDER];
  }

  return Array.from(new Set(parsedKinds));
}

function includesQuery(item: SearchEntityItem, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalize(query);
  return normalize(item.searchableText).includes(normalizedQuery) || normalize(item.title).includes(normalizedQuery);
}

function resolveArtistName(item: SearchEntityItem): string {
  const title = item.title.trim();
  const fallback = item.authorOrChoir.trim();

  if (!title) {
    return fallback || 'Artista';
  }

  if (title.toLowerCase() === 'artista' && fallback) {
    return fallback;
  }

  return title;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return text;
  const idx = normalize(text).indexOf(normalizedQuery);
  if (idx === -1) return text;
  const end = idx + normalizedQuery.length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-page__highlight">{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function formatDuration(ms?: number): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatCount(n?: number): string | null {
  if (!n || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getItemDate(item: SearchEntityItem): number {
  if (item.kind === 'song') {
    const song = item as SearchSongItem;
    const pub = song.publishedAt ? new Date(song.publishedAt).getTime() : 0;
    const cre = song.createdAt ? new Date(song.createdAt).getTime() : 0;
    return Math.max(pub, cre);
  }
  return 0;
}

function sortItems(items: SearchEntityItem[], sort: SortOption, query: string): SearchEntityItem[] {
  if (sort === 'alpha') {
    return [...items].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  }
  if (sort === 'popular') {
    return [...items].sort((a, b) => {
      const aPop = (a as SearchSongItem).popularity ?? 0;
      const bPop = (b as SearchSongItem).popularity ?? 0;
      if (bPop !== aPop) return bPop - aPop;
      const aViews = (a as SearchSongItem).totalViews ?? 0;
      const bViews = (b as SearchSongItem).totalViews ?? 0;
      return bViews - aViews;
    });
  }
  if (sort === 'recent') {
    return [...items].sort((a, b) => getItemDate(b) - getItemDate(a));
  }
  // relevance: items matching query title first, then by popularity
  if (query) {
    const nq = normalize(query);
    return [...items].sort((a, b) => {
      const aTitle = normalize(a.title).includes(nq) ? 1 : 0;
      const bTitle = normalize(b.title).includes(nq) ? 1 : 0;
      if (bTitle !== aTitle) return bTitle - aTitle;
      const aPop = (a as SearchSongItem).popularity ?? 0;
      const bPop = (b as SearchSongItem).popularity ?? 0;
      return bPop - aPop;
    });
  }
  return items;
}

export function SearchExplorer({ initialQuery = '', initialCategory = 'todos', dataset }: SearchExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cachedDataset = useMemo(() => dataset ?? EMPTY_DATASET, [dataset]);
  const selectedKindsFromQuery = useMemo(() => parseKindsFromQuery(searchParams.get('kinds')), [searchParams]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeDataset, setActiveDataset] = useState<SearchDataset>(cachedDataset);
  const [isLoading, setIsLoading] = useState<boolean>(cachedDataset === EMPTY_DATASET);
  const [removedRepertoireIds, setRemovedRepertoireIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(initialQuery || searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery || searchParams.get('q') || '');
  const [selectedKinds, setSelectedKinds] = useState<SearchEntityKind[]>(selectedKindsFromQuery);
  const [selectedLiturgicalTypes, setSelectedLiturgicalTypes] = useState<string[]>(parseCsvParam(searchParams.get('litTypes')));
  const [selectedLiturgicalTimes, setSelectedLiturgicalTimes] = useState<string[]>(parseCsvParam(searchParams.get('litTimes')));
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>(parseCsvParam(searchParams.get('authors')));
  const [selectedCategories, setSelectedCategories] = useState<string[]>(parseCsvParam(searchParams.get('categories')));
  const [premiumOnly, setPremiumOnly] = useState(parseBooleanParam(searchParams.get('premium')));
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(parseCsvParam(searchParams.get('instruments')));
  const [selectedNotations, setSelectedNotations] = useState<string[]>(parseCsvParam(searchParams.get('notations')));
  const [selectedAlbumTypes, setSelectedAlbumTypes] = useState<string[]>(parseCsvParam(searchParams.get('albumTypes')));
  const [durationBuckets, setDurationBuckets] = useState<DurationBucket[]>(parseCsvParam(searchParams.get('duration')).filter((v): v is DurationBucket => v === 'short' || v === 'medium' || v === 'long'));
  const [repertoireVisibility, setRepertoireVisibility] = useState<RepertoireVisibility[]>(parseCsvParam(searchParams.get('repVis')).filter((v): v is RepertoireVisibility => v === 'mine' || v === 'public'));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sort') as SortOption) || 'relevance');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileSidebarUi, setIsMobileSidebarUi] = useState(false);
  const [sidebarDragOffset, setSidebarDragOffset] = useState(0);
  const [bookmarkedRepertoires, setBookmarkedRepertoires] = useState<Set<string>>(new Set());
  const [authorFilterQuery, setAuthorFilterQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const sidebarDragStartRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Save search term to recent searches when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      saveRecentSearch(debouncedQuery);
      setRecentSearches(getRecentSearches());
    }
  }, [debouncedQuery]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setShowRecentSearches(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Liturgical calendar awareness: suggest today's season on first load
  const liturgicalSeasonSuggestion = useMemo(() => {
    const season = getCurrentLiturgicalSeason();
    if (!season) return null;
    const hasSeasonFilter = activeDataset.filters.liturgicalTimes.some((t) => normalize(t).includes(normalize(season)));
    if (hasSeasonFilter && !selectedLiturgicalTimes.length) {
      return season;
    }
    return null;
  }, [activeDataset.filters.liturgicalTimes, selectedLiturgicalTimes]);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedResultIndex(-1);
  }, [debouncedQuery, selectedKinds, selectedLiturgicalTypes, selectedLiturgicalTimes, selectedAuthors, selectedCategories, premiumOnly, selectedInstruments, selectedNotations, selectedAlbumTypes, durationBuckets, repertoireVisibility, sortBy]);

  const toggleSongSelection = useCallback((songId: string) => {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }, []);

  const clearSongSelection = useCallback(() => {
    setSelectedSongIds(new Set());
  }, []);

  const handleShare = useCallback(async (item: SearchEntityItem, event: React.MouseEvent) => {
    event.stopPropagation();
    const url = typeof window !== 'undefined' ? `${window.location.origin}/songs/${item.songId ?? item.id}` : '';
    if (url && navigator.share) {
      try { await navigator.share({ title: item.title, url }); } catch {}
    } else if (url) {
      try { await navigator.clipboard.writeText(url); } catch {}
    }
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedKinds.length !== KIND_ORDER.length) count += selectedKinds.length;
    count += selectedLiturgicalTypes.length + selectedLiturgicalTimes.length + selectedAuthors.length;
    count += selectedCategories.length;
    count += selectedInstruments.length + selectedNotations.length + selectedAlbumTypes.length;
    count += durationBuckets.length + repertoireVisibility.length;
    if (premiumOnly) count += 1;
    return count;
  }, [selectedKinds, selectedLiturgicalTypes, selectedLiturgicalTimes, selectedAuthors, selectedCategories, selectedInstruments, selectedNotations, selectedAlbumTypes, durationBuckets, repertoireVisibility, premiumOnly]);

  const hasActiveFilters = activeFilterCount > 0 || query.trim().length > 0;

  const clearAllFilters = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedKinds([...KIND_ORDER]);
    setSelectedLiturgicalTypes([]);
    setSelectedLiturgicalTimes([]);
    setSelectedAuthors([]);
    setSelectedCategories([]);
    setPremiumOnly(false);
    setSelectedInstruments([]);
    setSelectedNotations([]);
    setSelectedAlbumTypes([]);
    setDurationBuckets([]);
    setRepertoireVisibility([]);
    setAuthorFilterQuery('');
  }, []);

  const applyPreset = useCallback((preset: FilterPreset) => {
    clearAllFilters();
    preset.apply();
  }, [clearAllFilters]);

  const filterPresets = useMemo<FilterPreset[]>(() => [
    {
      id: 'popular',
      label: 'Populares',
      icon: 'trending_up',
      apply: () => setSortBy('popular')
    },
    {
      id: 'recent',
      label: 'Recientes',
      icon: 'schedule',
      apply: () => setSortBy('recent')
    },
    {
      id: 'premium',
      label: 'Premium',
      icon: 'workspace_premium',
      apply: () => setPremiumOnly(true)
    },
    {
      id: 'songs',
      label: 'Solo canciones',
      icon: 'music_note',
      apply: () => setSelectedKinds(['song'])
    }
  ], []);

  const activePresetId = useMemo<string | null>(() => {
    if (premiumOnly && activeFilterCount === 1) return 'premium';
    if (selectedKinds.length === 1 && selectedKinds[0] === 'song' && activeFilterCount === 1) return 'songs';
    if (sortBy === 'popular' && activeFilterCount === 1) return 'popular';
    if (sortBy === 'recent' && activeFilterCount === 1) return 'recent';
    return null;
  }, [premiumOnly, selectedKinds, sortBy, activeFilterCount]);

  const toggleGroupExpanded = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  // Lock body scroll when sidebar is expanded on mobile
  useEffect(() => {
    if (isSidebarExpanded) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isSidebarExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsMobileSidebarUi(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isSidebarExpanded) {
      setSidebarDragOffset(0);
      sidebarDragStartRef.current = null;
    }
  }, [isSidebarExpanded]);

  const handleSidebarDragStart = useCallback((clientY: number, target: EventTarget | null) => {
    if (!isMobileSidebarUi) {
      return;
    }

    const element = target instanceof HTMLElement ? target : null;
    if (element?.closest('.search-page__sidebar-close')) {
      return;
    }

    sidebarDragStartRef.current = clientY;
  }, [isMobileSidebarUi]);

  const handleSidebarDragMove = useCallback((clientY: number) => {
    if (!isMobileSidebarUi || sidebarDragStartRef.current === null) {
      return;
    }

    const delta = clientY - sidebarDragStartRef.current;
    setSidebarDragOffset(delta > 0 ? delta : 0);
  }, [isMobileSidebarUi]);

  const handleSidebarDragEnd = useCallback(() => {
    if (!isMobileSidebarUi || sidebarDragStartRef.current === null) {
      return;
    }

    sidebarDragStartRef.current = null;
    setSidebarDragOffset((current) => {
      if (current > 110) {
        setIsSidebarExpanded(false);
      }
      return 0;
    });
  }, [isMobileSidebarUi]);

  const sidebarStyle = isMobileSidebarUi && isSidebarExpanded && sidebarDragOffset > 0
    ? { transform: `translateY(${sidebarDragOffset}px)` }
    : undefined;

  useEffect(() => {
    setSelectedKinds(selectedKindsFromQuery);
  }, [selectedKindsFromQuery]);

  // Unified URL sync for all filters
  useEffect(() => {
    const nextParams = new URLSearchParams();

    if (debouncedQuery) nextParams.set('q', debouncedQuery);
    if (selectedKinds.length !== KIND_ORDER.length) nextParams.set('kinds', selectedKinds.join(','));
    if (selectedLiturgicalTypes.length) nextParams.set('litTypes', selectedLiturgicalTypes.join(','));
    if (selectedLiturgicalTimes.length) nextParams.set('litTimes', selectedLiturgicalTimes.join(','));
    if (selectedAuthors.length) nextParams.set('authors', selectedAuthors.join(','));
    if (selectedCategories.length) nextParams.set('categories', selectedCategories.join(','));
    if (premiumOnly) nextParams.set('premium', '1');
    if (selectedInstruments.length) nextParams.set('instruments', selectedInstruments.join(','));
    if (selectedNotations.length) nextParams.set('notations', selectedNotations.join(','));
    if (selectedAlbumTypes.length) nextParams.set('albumTypes', selectedAlbumTypes.join(','));
    if (durationBuckets.length) nextParams.set('duration', durationBuckets.join(','));
    if (repertoireVisibility.length) nextParams.set('repVis', repertoireVisibility.join(','));
    if (sortBy !== 'relevance') nextParams.set('sort', sortBy);

    const queryString = nextParams.toString();
    const currentQueryString = searchParams.toString();
    if (queryString === currentQueryString) return;

    router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
  }, [router, searchParams, debouncedQuery, selectedKinds, selectedLiturgicalTypes, selectedLiturgicalTimes, selectedAuthors, selectedCategories, premiumOnly, selectedInstruments, selectedNotations, selectedAlbumTypes, durationBuckets, repertoireVisibility, sortBy]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const normalizedCategory = initialCategory.trim().toLowerCase();
    const categoryParam = !normalizedCategory || normalizedCategory === 'todos' ? '' : normalizedCategory;

    const hydrate = async () => {
      setIsLoading(true);
      try {
        const [resolvedUserId, resolvedDataset] = await Promise.all([
          getClientCurrentUserId(),
          getSearchDatasetClient({ scope: 'catalog', category: categoryParam, signal: controller.signal })
        ]);

        if (disposed) {
          return;
        }

        setCurrentUserId(resolvedUserId);
        setActiveDataset(resolvedDataset);
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [initialCategory]);

  const visibleItems = useMemo(() => {
    const seen = new Set<string>();
    return activeDataset.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);

      if (item.kind === 'repertoire' && removedRepertoireIds.has(item.id)) {
        return false;
      }

      if (item.kind !== 'repertoire') {
        return true;
      }

      return item.ownerUserId === currentUserId || item.isPublic;
    });
  }, [activeDataset.items, currentUserId, removedRepertoireIds]);

  // Load bookmark states for visible repertoires
  useEffect(() => {
    const repertoireIds = visibleItems
      .filter((item) => item.kind === 'repertoire')
      .map((item) => item.id);

    if (repertoireIds.length === 0 || !currentUserId) {
      return;
    }

    repertoireIds.forEach((repertoireId) => {
      void loadRepertoireBookmark(repertoireId).then((isBookmarked) => {
        if (typeof isBookmarked === 'boolean') {
          setBookmarkedRepertoires((prev) => {
            const next = new Set(prev);
            if (isBookmarked) {
              next.add(repertoireId);
            } else {
              next.delete(repertoireId);
            }
            return next;
          });
        }
      });
    });
  }, [visibleItems, currentUserId]);

  const toggleBookmark = async (repertoireId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const isCurrentlyBookmarked = bookmarkedRepertoires.has(repertoireId);
    const newState = !isCurrentlyBookmarked;

    // Optimistic update
    setBookmarkedRepertoires((prev) => {
      const next = new Set(prev);
      if (newState) {
        next.add(repertoireId);
      } else {
        next.delete(repertoireId);
      }
      return next;
    });

    // Persist to backend
    await saveRepertoireBookmark(repertoireId, newState);
  };

  const filteredItems = useMemo(() => {
    return visibleItems.filter((item) => {
      const byQuery = includesQuery(item, debouncedQuery);
      const byKind = selectedKinds.includes(item.kind);
      const byType = selectedLiturgicalTypes.length === 0 || selectedLiturgicalTypes.includes(item.liturgicalType);
      const byTime = selectedLiturgicalTimes.length === 0 || selectedLiturgicalTimes.includes(item.liturgicalTime);
      const byAuthor = selectedAuthors.length === 0 || selectedAuthors.includes(item.authorOrChoir);
      const byCategory = selectedCategories.length === 0 || item.categories.some((c) => selectedCategories.includes(c));
      const byPremium = !premiumOnly || (item.kind === 'song' && (item as SearchSongItem).isPremium) || (item.kind === 'version' && (item as SearchVersionItem).isPremium);
      const byInstrument = item.kind !== 'version' || selectedInstruments.length === 0 || selectedInstruments.includes((item as SearchVersionItem).instrument);
      const byNotation = item.kind !== 'version' || selectedNotations.length === 0 || selectedNotations.includes((item as SearchVersionItem).notationType);
      const byAlbumType = item.kind !== 'album' || selectedAlbumTypes.length === 0 || selectedAlbumTypes.includes((item as SearchAlbumItem).albumType);
      const byDuration = item.kind !== 'song' || durationBuckets.length === 0 || (() => {
        const dur = (item as SearchSongItem).durationMs;
        if (!dur) return false;
        return durationBuckets.some((b) => {
          const bucket = DURATION_BUCKETS.find((d) => d.value === b);
          return bucket ? dur <= bucket.max : false;
        });
      })();
      const byRepertoireVisibility = item.kind !== 'repertoire' || repertoireVisibility.length === 0 || (() => {
        const rep = item as SearchrepertoireItem;
        if (repertoireVisibility.includes('mine') && rep.ownerUserId === currentUserId) return true;
        if (repertoireVisibility.includes('public') && rep.isPublic && rep.ownerUserId !== currentUserId) return true;
        return false;
      })();
      return byQuery && byKind && byType && byTime && byAuthor && byCategory && byPremium && byInstrument && byNotation && byAlbumType && byDuration && byRepertoireVisibility;
    });
  }, [debouncedQuery, selectedAuthors, selectedKinds, selectedLiturgicalTimes, selectedLiturgicalTypes, visibleItems, selectedCategories, premiumOnly, selectedInstruments, selectedNotations, selectedAlbumTypes, durationBuckets, repertoireVisibility, currentUserId]);

  const sortedItems = useMemo(() => sortItems(filteredItems, sortBy, debouncedQuery), [filteredItems, sortBy, debouncedQuery]);

  const grouped = useMemo(() => {
    return {
      songs: sortedItems.filter((item): item is SearchSongItem => item.kind === 'song'),
      albums: sortedItems.filter((item): item is SearchAlbumItem => item.kind === 'album'),
      repertoires: sortedItems.filter((item): item is SearchrepertoireItem => item.kind === 'repertoire'),
      artists: sortedItems.filter((item) => item.kind === 'artist'),
      versions: sortedItems.filter((item) => item.kind === 'version')
    };
  }, [sortedItems]);

  const totalCount = grouped.songs.length + grouped.albums.length + grouped.repertoires.length + grouped.artists.length + grouped.versions.length;

  const navigateByItem = useCallback((item: SearchEntityItem) => {
    if (item.kind === 'song') {
      router.push(`/songs/${item.songId ?? item.id}`);
      return;
    }

    if (item.kind === 'repertoire') {
      router.push(`/repertoires/${item.repertoireId ?? item.id}`);
      return;
    }

    if (item.kind === 'album') {
      router.push(`/albums/${item.albumId ?? item.id}`);
      return;
    }

    if (item.kind === 'artist') {
      const artistName = resolveArtistName(item);
      router.push(
        getArtistProfileHref({
          artistId: item.artistId ?? item.id,
          artistName: artistName
        })
      );
      return;
    }

    if (item.kind === 'version') {
      const songId = item.songId;
      if (songId) {
        router.push(`/songs/${encodeURIComponent(songId)}?versionId=${encodeURIComponent(item.id)}`);
        return;
      }
    }

    router.push(`/songs/${item.songId ?? item.id}`);
  }, [router]);

  // Build a flat list of visible result items for keyboard navigation
  const flatResults = useMemo(() => [...sortedItems], [sortedItems]);

  const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && flatResults.length > 0) {
      event.preventDefault();
      setFocusedResultIndex(0);
      setShowRecentSearches(false);
    } else if (event.key === 'Enter' && focusedResultIndex >= 0 && focusedResultIndex < flatResults.length) {
      event.preventDefault();
      navigateByItem(flatResults[focusedResultIndex]);
    }
  }, [flatResults, focusedResultIndex, navigateByItem]);

  const handleResultsKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedResultIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedResultIndex((prev) => Math.max(prev - 1, -1));
      if (focusedResultIndex === 0) searchInputRef.current?.focus();
    } else if (event.key === 'Enter' && focusedResultIndex >= 0 && focusedResultIndex < flatResults.length) {
      event.preventDefault();
      navigateByItem(flatResults[focusedResultIndex]);
    } else if (event.key === 'Escape') {
      setFocusedResultIndex(-1);
      searchInputRef.current?.focus();
    }
  }, [flatResults, focusedResultIndex, navigateByItem]);

  const closestMatches = useMemo(() => {
    if (totalCount > 0 || !debouncedQuery.trim()) return [];
    return findClosestMatches(debouncedQuery, visibleItems, 3);
  }, [totalCount, debouncedQuery, visibleItems]);

  const trendingItems = useMemo(() => {
    if (totalCount > 0) return [];
    return [...visibleItems]
      .sort((a, b) => ((b as SearchSongItem).popularity ?? 0) - ((a as SearchSongItem).popularity ?? 0))
      .slice(0, 4);
  }, [totalCount, visibleItems]);

  const filteredAuthors = useMemo(() => {
    if (!authorFilterQuery) return activeDataset.filters.authorOrChoirs;
    const nq = normalize(authorFilterQuery);
    return activeDataset.filters.authorOrChoirs.filter((a) => normalize(a).includes(nq));
  }, [authorFilterQuery, activeDataset.filters.authorOrChoirs]);

  const availableInstruments = useMemo(() => {
    const set = new Set<string>();
    visibleItems.forEach((item) => {
      if (item.kind === 'version') set.add((item as SearchVersionItem).instrument);
    });
    return Array.from(set).sort();
  }, [visibleItems]);

  const availableNotations = useMemo(() => {
    const set = new Set<string>();
    visibleItems.forEach((item) => {
      if (item.kind === 'version') set.add((item as SearchVersionItem).notationType);
    });
    return Array.from(set).sort();
  }, [visibleItems]);

  const availableAlbumTypes = useMemo(() => {
    const set = new Set<string>();
    visibleItems.forEach((item) => {
      if (item.kind === 'album') set.add((item as SearchAlbumItem).albumType);
    });
    return Array.from(set).sort();
  }, [visibleItems]);

  const toggleGeneric = useCallback(<T extends string>(value: T, selected: T[], setSelected: (next: T[]) => void) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((item) => item !== value));
      return;
    }

    setSelected([...selected, value]);
  }, []);

  const toggleDurationBucket = useCallback((bucket: DurationBucket) => {
    setDurationBuckets((prev) => prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket]);
  }, []);

  const toggleRepertoireVisibility = useCallback((vis: RepertoireVisibility) => {
    setRepertoireVisibility((prev) => prev.includes(vis) ? prev.filter((v) => v !== vis) : [...prev, vis]);
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    selectedLiturgicalTypes.forEach((t) => chips.push({ label: t, onRemove: () => toggleGeneric(t, selectedLiturgicalTypes, setSelectedLiturgicalTypes) }));
    selectedLiturgicalTimes.forEach((t) => chips.push({ label: t, onRemove: () => toggleGeneric(t, selectedLiturgicalTimes, setSelectedLiturgicalTimes) }));
    selectedAuthors.forEach((a) => chips.push({ label: a, onRemove: () => toggleGeneric(a, selectedAuthors, setSelectedAuthors) }));
    selectedCategories.forEach((c) => chips.push({ label: c, onRemove: () => toggleGeneric(c, selectedCategories, setSelectedCategories) }));
    selectedInstruments.forEach((i) => chips.push({ label: i, onRemove: () => toggleGeneric(i, selectedInstruments, setSelectedInstruments) }));
    selectedNotations.forEach((n) => chips.push({ label: n, onRemove: () => toggleGeneric(n, selectedNotations, setSelectedNotations) }));
    selectedAlbumTypes.forEach((a) => chips.push({ label: a, onRemove: () => toggleGeneric(a, selectedAlbumTypes, setSelectedAlbumTypes) }));
    durationBuckets.forEach((b) => {
      const bucket = DURATION_BUCKETS.find((d) => d.value === b);
      chips.push({ label: bucket?.label ?? b, onRemove: () => toggleDurationBucket(b) });
    });
    repertoireVisibility.forEach((v) => {
      const opt = REPERTOIRE_VISIBILITY_OPTIONS.find((o) => o.value === v);
      chips.push({ label: opt?.label ?? v, onRemove: () => toggleRepertoireVisibility(v) });
    });
    if (premiumOnly) chips.push({ label: 'Solo Premium', onRemove: () => setPremiumOnly(false) });
    return chips;
  }, [selectedLiturgicalTypes, selectedLiturgicalTimes, selectedAuthors, selectedCategories, selectedInstruments, selectedNotations, selectedAlbumTypes, durationBuckets, repertoireVisibility, premiumOnly, toggleGeneric, toggleDurationBucket, toggleRepertoireVisibility]);

  const onEditrepertoire = (repertoire: SearchrepertoireItem) => {
    router.push(`/repertoires/${repertoire.repertoireId ?? repertoire.id}/edit`);
  };

  const onDeleterepertoire = async (repertoire: SearchrepertoireItem) => {
    const shouldDelete = window.confirm(`¿Seguro que quieres eliminar el repertorio \"${repertoire.title}\"?`);

    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleterepertoire(repertoire.repertoireId ?? repertoire.id);

    if (!result.ok) {
      window.alert('No se pudo eliminar el repertorio. Verifica permisos o intenta de nuevo.');
      return;
    }

    setRemovedRepertoireIds((prev) => {
      const next = new Set(prev);
      next.add(repertoire.id);
      return next;
    });
  };

  const renderFilterGroup = (
    groupKey: string,
    label: string,
    options: string[],
    selected: string[],
    setSelected: (next: string[]) => void
  ) => {
    const isExpanded = expandedGroups.has(groupKey);
    const showToggle = options.length > FILTER_COLLAPSE_THRESHOLD;
    const visibleOptions = showToggle && !isExpanded ? options.slice(0, FILTER_COLLAPSE_THRESHOLD) : options;

    return (
      <div className="search-page__filter-section">
        <div className="search-page__filter-header">
          <h3 className="search-page__filter-label">{label}</h3>
          {selected.length > 0 && (
            <button
              type="button"
              className="search-page__filter-clear"
              onClick={() => setSelected([])}
              aria-label={`Limpiar ${label}`}
            >
              Limpiar
            </button>
          )}
        </div>
        {visibleOptions.map((option) => (
          <label key={option} className="search-page__filter-row">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggleGeneric(option, selected, setSelected)}
            />
            <span>{option}</span>
          </label>
        ))}
        {showToggle && (
          <button
            type="button"
            className="search-page__filter-toggle"
            onClick={() => toggleGroupExpanded(groupKey)}
            aria-expanded={isExpanded}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
            {isExpanded ? 'Ver menos' : `Ver ${options.length - FILTER_COLLAPSE_THRESHOLD} más`}
          </button>
        )}
      </div>
    );
  };

  const renderEmptyState = (icon: string, message: string) => (
    <div className="search-page__empty-state">
      <span className="material-symbols-outlined search-page__empty-icon" aria-hidden="true">{icon}</span>
      <p>{message}</p>
    </div>
  );

  return (
    <section className={`search-page ${isSidebarExpanded ? 'is-sidebar-expanded' : ''}`}>
      <LoadingBubble isLoading={isLoading} message="Buscando canciones…" showDelay={0} />
      {/* Mobile backdrop */}
      {isSidebarExpanded && (
        <div
          className="search-page__backdrop is-visible"
          onClick={() => setIsSidebarExpanded(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`search-page__sidebar ${isSidebarExpanded ? 'is-expanded' : ''}${sidebarDragOffset > 0 ? ' is-dragging' : ''}`} aria-label="filtros de búsqueda" style={sidebarStyle}>
        <div
          className="search-page__sidebar-header"
          onPointerDown={(event) => handleSidebarDragStart(event.clientY, event.target)}
          onPointerDownCapture={(event) => {
            if (isMobileSidebarUi) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => handleSidebarDragMove(event.clientY)}
          onPointerUp={handleSidebarDragEnd}
          onPointerCancel={handleSidebarDragEnd}
        >
          <h2 className="search-page__sidebar-title">
            <span className="material-symbols-outlined" aria-hidden="true">filter_list</span>
            Filtros
            {activeFilterCount > 0 && (
              <span className="search-page__filter-count-badge" aria-label={`${activeFilterCount} filtros activos`}>{activeFilterCount}</span>
            )}
          </h2>
          <button
            type="button"
            className="search-page__sidebar-close"
            onClick={() => setIsSidebarExpanded(false)}
            aria-label="Cerrar filtros"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="search-page__filter-group">
          {hasActiveFilters && (
            <button
              type="button"
              className="search-page__clear-all"
              onClick={clearAllFilters}
            >
              <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
              Limpiar todo
            </button>
          )}

          <div className="search-page__filter-section">
            <div className="search-page__filter-header">
              <h3 className="search-page__filter-label">Mostrar</h3>
              {selectedKinds.length !== KIND_ORDER.length && selectedKinds.length > 0 && (
                <button
                  type="button"
                  className="search-page__filter-clear"
                  onClick={() => setSelectedKinds([...KIND_ORDER])}
                  aria-label="Limpiar Mostrar"
                >
                  Limpiar
                </button>
              )}
            </div>
            {KIND_ORDER.map((kind) => (
              <label key={kind} className="search-page__filter-row">
                <input type="checkbox" checked={selectedKinds.includes(kind)} onChange={() => toggleGeneric(kind, selectedKinds, setSelectedKinds)} />
                <span>{kindLabels[kind]}</span>
              </label>
            ))}
          </div>

          {renderFilterGroup('liturgicalTypes', 'Tipo Litúrgico', activeDataset.filters.liturgicalTypes, selectedLiturgicalTypes, setSelectedLiturgicalTypes)}
          {renderFilterGroup('liturgicalTimes', 'Tiempo Litúrgico', activeDataset.filters.liturgicalTimes, selectedLiturgicalTimes, setSelectedLiturgicalTimes)}

          <div className="search-page__filter-section">
            <div className="search-page__filter-header">
              <h3 className="search-page__filter-label">Autor / Coro</h3>
              {selectedAuthors.length > 0 && (
                <button
                  type="button"
                  className="search-page__filter-clear"
                  onClick={() => setSelectedAuthors([])}
                  aria-label="Limpiar Autor / Coro"
                >
                  Limpiar
                </button>
              )}
            </div>
            {activeDataset.filters.authorOrChoirs.length > FILTER_COLLAPSE_THRESHOLD && (
              <div className="search-page__filter-search">
                <span className="material-symbols-outlined" aria-hidden="true">search</span>
                <input
                  type="search"
                  placeholder="Filtrar autores…"
                  value={authorFilterQuery}
                  onChange={(event) => setAuthorFilterQuery(event.target.value)}
                  aria-label="Filtrar lista de autores"
                />
              </div>
            )}
            {filteredAuthors.map((author) => (
              <label key={author} className="search-page__filter-row">
                <input type="checkbox" checked={selectedAuthors.includes(author)} onChange={() => toggleGeneric(author, selectedAuthors, setSelectedAuthors)} />
                <span>{author}</span>
              </label>
            ))}
            {filteredAuthors.length === 0 && (
              <p className="search-page__filter-empty">Sin coincidencias</p>
            )}
          </div>

          {activeDataset.filters.categories.length > 0 && renderFilterGroup('categories', 'Categorías', activeDataset.filters.categories, selectedCategories, setSelectedCategories)}

          <div className="search-page__filter-section">
            <div className="search-page__filter-header">
              <h3 className="search-page__filter-label">Premium</h3>
            </div>
            <label className="search-page__filter-row search-page__filter-toggle-row">
              <input
                type="checkbox"
                checked={premiumOnly}
                onChange={() => setPremiumOnly((prev) => !prev)}
                aria-label="Solo contenido Premium"
              />
              <span>Solo Premium</span>
            </label>
          </div>

          {availableInstruments.length > 0 && renderFilterGroup('instruments', 'Instrumento', availableInstruments, selectedInstruments, setSelectedInstruments)}

          {availableNotations.length > 0 && renderFilterGroup('notations', 'Notación', availableNotations, selectedNotations, setSelectedNotations)}

          {availableAlbumTypes.length > 0 && renderFilterGroup('albumTypes', 'Tipo de álbum', availableAlbumTypes, selectedAlbumTypes, setSelectedAlbumTypes)}

          {selectedKinds.includes('song') && (
            <div className="search-page__filter-section">
              <div className="search-page__filter-header">
                <h3 className="search-page__filter-label">Duración</h3>
                {durationBuckets.length > 0 && (
                  <button
                    type="button"
                    className="search-page__filter-clear"
                    onClick={() => setDurationBuckets([])}
                    aria-label="Limpiar Duración"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              {DURATION_BUCKETS.map((bucket) => (
                <label key={bucket.value} className="search-page__filter-row">
                  <input
                    type="checkbox"
                    checked={durationBuckets.includes(bucket.value)}
                    onChange={() => toggleDurationBucket(bucket.value)}
                  />
                  <span>{bucket.label}</span>
                </label>
              ))}
            </div>
          )}

          {selectedKinds.includes('repertoire') && (
            <div className="search-page__filter-section">
              <div className="search-page__filter-header">
                <h3 className="search-page__filter-label">Repertorios</h3>
                {repertoireVisibility.length > 0 && (
                  <button
                    type="button"
                    className="search-page__filter-clear"
                    onClick={() => setRepertoireVisibility([])}
                    aria-label="Limpiar Repertorios"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              {REPERTOIRE_VISIBILITY_OPTIONS.map((opt) => (
                <label key={opt.value} className="search-page__filter-row">
                  <input
                    type="checkbox"
                    checked={repertoireVisibility.includes(opt.value)}
                    onChange={() => toggleRepertoireVisibility(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="search-page__content">
        <header className="search-page__header">
          <div className="search-page__header-top">
            <h1 className="search-page__title">Gestión de Búsqueda</h1>
            <button
              type="button"
              className="search-page__mobile-filter-toggle"
              onClick={() => setIsSidebarExpanded(true)}
              aria-label={`Abrir filtros${activeFilterCount > 0 ? `, ${activeFilterCount} activos` : ''}`}
            >
              <span className="material-symbols-outlined">filter_list</span>
              Filtros
              {activeFilterCount > 0 && (
                <span className="search-page__filter-count-badge" aria-hidden="true">{activeFilterCount}</span>
              )}
            </button>
          </div>
          <div className="search-page__search-bar" aria-label="buscar canciones, álbumes, Repertorios, artistas y versiones">
            <span className="material-symbols-outlined search-page__search-icon" aria-hidden="true">search</span>
            <input
              ref={searchInputRef}
              className="search-page__search-input"
              type="search"
              placeholder="Buscar canciones, álbumes, Repertorios, artistas o versiones"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setShowRecentSearches(true)}
              onBlur={() => setTimeout(() => setShowRecentSearches(false), 200)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Buscar"
            />
            {query && (
              <button
                type="button"
                className="search-page__search-clear"
                onClick={() => { setQuery(''); setDebouncedQuery(''); }}
                aria-label="Limpiar búsqueda"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
            {showRecentSearches && recentSearches.length > 0 && !query && (
              <div className="search-page__recent-searches" role="listbox" aria-label="búsquedas recientes">
                <div className="search-page__recent-header">Búsquedas recientes</div>
                {recentSearches.map((term, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="search-page__recent-item"
                    onMouseDown={() => { setQuery(term); setDebouncedQuery(term); setShowRecentSearches(false); }}
                    role="option"
                    aria-selected="false"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">history</span>
                    {term}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Liturgical season suggestion */}
        {!isLoading && liturgicalSeasonSuggestion && (
          <div className="search-page__season-suggestion">
            <span className="material-symbols-outlined" aria-hidden="true">church</span>
            <span>Estamos en tiempo de <strong>{liturgicalSeasonSuggestion}</strong></span>
            <button
              type="button"
              className="search-page__season-btn"
              onClick={() => {
                const match = activeDataset.filters.liturgicalTimes.find((t) => normalize(t).includes(normalize(liturgicalSeasonSuggestion)));
                if (match) setSelectedLiturgicalTimes([match]);
              }}
            >
              Filtrar por este tiempo
            </button>
          </div>
        )}

        {/* Filter presets */}
        {!isLoading && (
          <div className="search-page__presets" role="toolbar" aria-label="filtros rápidos">
            {filterPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`search-page__preset ${activePresetId === preset.id ? 'is-active' : ''}`}
                onClick={() => applyPreset(preset)}
                aria-pressed={activePresetId === preset.id}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{preset.icon}</span>
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Active filter chips */}
        {!isLoading && activeFilterChips.length > 0 && (
          <div className="search-page__active-chips" aria-label="filtros activos">
            {activeFilterChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="search-page__active-chip"
                onClick={chip.onRemove}
                aria-label={`Quitar filtro ${chip.label}`}
              >
                {chip.label}
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            ))}
            <button
              type="button"
              className="search-page__active-chip search-page__active-chip--clear"
              onClick={clearAllFilters}
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* Sort + result count bar */}
        {!isLoading && totalCount > 0 && (
          <div className="search-page__toolbar">
            <span className="search-page__result-count" aria-live="polite">
              {totalCount} resultado{totalCount !== 1 ? 's' : ''}
            </span>
            <div className="search-page__sort">
              <label htmlFor="search-sort" className="search-page__sort-label">Ordenar:</label>
              <select
                id="search-sort"
                className="search-page__sort-select"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
              >
                {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                  <option key={opt} value={opt}>{sortLabels[opt]}</option>
                ))}
              </select>
            </div>
            <div className="search-page__view-toggle" role="group" aria-label="Modo de vista">
              <button
                type="button"
                className={`search-page__view-btn ${bulkMode ? 'is-active' : ''}`}
                onClick={() => { setBulkMode(!bulkMode); if (bulkMode) clearSongSelection(); }}
                aria-pressed={bulkMode}
                aria-label="Modo selección múltiple"
                title="Seleccionar varias canciones"
              >
                <span className="material-symbols-outlined" aria-hidden="true">checklist</span>
              </button>
              <button
                type="button"
                className={`search-page__view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                aria-label="Vista de cuadrícula"
              >
                <span className="material-symbols-outlined" aria-hidden="true">grid_view</span>
              </button>
              <button
                type="button"
                className={`search-page__view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="Vista de lista"
              >
                <span className="material-symbols-outlined" aria-hidden="true">view_list</span>
              </button>
            </div>
          </div>
        )}

        {/* Count chips - now interactive */}
        {!isLoading ? (
          <div className="search-page__chips" aria-label="conteo de resultados">
            {KIND_ORDER.map((kind) => {
              const count = grouped[`${kind}s` as keyof typeof grouped].length;
              const isActive = selectedKinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  className={`search-page__chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => toggleGeneric(kind, selectedKinds, setSelectedKinds)}
                  aria-pressed={isActive}
                >
                  {count} {kindLabels[kind]}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Global no-results state */}
        {!isLoading && totalCount === 0 && (
          <div className="search-page__no-results">
            <span className="material-symbols-outlined search-page__no-results-icon" aria-hidden="true">search_off</span>
            <h2>Sin resultados</h2>
            <p>No se encontraron elementos con los filtros actuales.</p>
            {hasActiveFilters && (
              <button type="button" className="search-page__no-results-btn" onClick={clearAllFilters}>
                <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
                Limpiar filtros y búsqueda
              </button>
            )}
            {closestMatches.length > 0 && (
              <div className="search-page__no-results-suggestions">
                <h3>¿Quizás buscabas…?</h3>
                <div className="search-page__suggestion-list">
                  {closestMatches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="search-page__suggestion-card"
                      onClick={() => navigateByItem(item)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {item.kind === 'song' ? 'music_note' : item.kind === 'album' ? 'album' : item.kind === 'artist' ? 'person' : 'description'}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {trendingItems.length > 0 && (
              <div className="search-page__no-results-suggestions">
                <h3>Tendencias</h3>
                <div className="search-page__suggestion-list">
                  {trendingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="search-page__suggestion-card"
                      onClick={() => navigateByItem(item)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">trending_up</span>
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div aria-busy aria-label="Cargando resultados">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="search-page__section">
                <SkeletonTitle />
                <SkeletonCard className="search-page__skeleton-card" />
              </div>
            ))}
          </div>
        ) : null}

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('song')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">music_note</span>
              Canciones
            </h2>
            {bulkMode && selectedSongIds.size > 0 && (
              <div className="search-page__bulk-actions">
                <span className="search-page__bulk-count">{selectedSongIds.size} seleccionada{selectedSongIds.size !== 1 ? 's' : ''}</span>
                <button
                  type="button"
                  className="search-page__bulk-btn"
                  onClick={() => {
                    const firstSelected = grouped.songs.find((s) => selectedSongIds.has(s.id));
                    if (firstSelected) navigateByItem(firstSelected);
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">playlist_add</span>
                  Crear repertorio
                </button>
                <button
                  type="button"
                  className="search-page__bulk-btn search-page__bulk-btn--ghost"
                  onClick={clearSongSelection}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">deselect</span>
                  Deseleccionar
                </button>
              </div>
            )}
          </div>
          <div className={`search-page__song-grid ${viewMode === 'list' ? 'is-list-view' : ''}`} onKeyDown={handleResultsKeyDown} tabIndex={-1} ref={resultsListRef}>
            {grouped.songs.length > 0 ? grouped.songs.map((item, index) => {
              const song = item as SearchSongItem;
              const duration = formatDuration(song.durationMs);
              const views = formatCount(song.totalViews);
              const likes = formatCount(song.likeCount);
              const isSelected = selectedSongIds.has(item.id);
              const flatIndex = flatResults.findIndex((r) => r.id === item.id);
              const isFocused = focusedResultIndex === flatIndex;
              return (
                <div
                  key={item.id}
                  className={`search-page__song-card ${isFocused ? 'is-focused' : ''} ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => bulkMode ? toggleSongSelection(item.id) : navigateByItem(item)}
                  role={bulkMode ? 'checkbox' : 'button'}
                  tabIndex={0}
                  aria-checked={isSelected}
                  aria-label={item.title}
                >
                  {bulkMode && (
                    <span className={`search-page__song-check ${isSelected ? 'is-checked' : ''}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                    </span>
                  )}
                  <div className="search-page__song-cover">
                    {item.images && item.images.length > 0 ? (
                      <Image src={item.images[0].url} alt={item.title} width={48} height={48} priority={index === 0} />
                    ) : (
                      <span className="material-symbols-outlined" aria-hidden="true">music_note</span>
                    )}
                  </div>
                  <div className="search-page__song-content">
                    <strong>{highlightMatch(item.title, debouncedQuery)}</strong>
                    <small>{item.subtitle}</small>
                    {(song.isPremium || duration || views || likes) && (
                    <div className="search-page__song-meta">
                      {song.isPremium && (
                        <span className="search-page__premium-badge">
                          <span className="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
                          Premium
                        </span>
                      )}
                      {duration && (
                        <span className="search-page__meta-dot">
                          <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
                          {duration}
                        </span>
                      )}
                      {views && (
                        <span className="search-page__meta-dot">
                          <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                          {views}
                        </span>
                      )}
                      {likes && (
                        <span className="search-page__meta-dot">
                          <span className="material-symbols-outlined" aria-hidden="true">favorite</span>
                          {likes}
                        </span>
                      )}
                    </div>
                  )}
                  </div>
                  
                  {!bulkMode && (
                    <div className="search-page__song-actions">
                      <button
                        type="button"
                        className="search-page__song-action"
                        onClick={(e) => { e.stopPropagation(); navigateByItem(item); }}
                        aria-label={`Reproducir ${item.title}`}
                        title="Reproducir"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                      </button>
                      <button
                        type="button"
                        className="search-page__song-action"
                        onClick={(e) => { e.stopPropagation(); navigateByItem(item); }}
                        aria-label={`Añadir ${item.title} a repertorio`}
                        title="Añadir a repertorio"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">playlist_add</span>
                      </button>
                      <button
                        type="button"
                        className="search-page__song-action"
                        onClick={(e) => handleShare(item, e)}
                        aria-label={`Compartir ${item.title}`}
                        title="Compartir"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">share</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }) : renderEmptyState('music_note', 'Sin canciones con los filtros actuales')}
          </div>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('album')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">album</span>
              Álbumes
            </h2>
          </div>
          {grouped.albums.length > 0 ? (
            <HorizontalConveyor ariaLabel="Álbumes" className="albums-conveyor" scrollStep={300}>
              <div className="search-page__album-grid">
                {grouped.albums.map((album, index) => (
                  <button key={album.id} type="button" className="search-page__album-card" onClick={() => navigateByItem(album)}>
                    <div className="search-page__album-cover">
                      {album.images && album.images.length > 0 ? (
                        <Image src={album.images[0].url} alt={album.title} width={200} height={200} priority={index === 0} />
                      ) : (
                        <span className="material-symbols-outlined search-page__album-placeholder" aria-hidden="true">album</span>
                      )}
                    </div>
                    <div className="search-page__album-content">
                      <strong>{highlightMatch(album.title, debouncedQuery)}</strong>
                      <small>{album.artistName}</small>
                      <div className="search-page__album-meta">
                        {album.releaseYear && (
                          <span className="search-page__meta-dot">
                            <span className="material-symbols-outlined" aria-hidden="true">calendar_today</span>
                            {album.releaseYear}
                          </span>
                        )}
                        {album.albumType && (
                          <span className="search-page__album-type-badge">{album.albumType}</span>
                        )}
                        <small className="search-page__album-badge">{album.totalTracks} Canciones</small>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </HorizontalConveyor>
          ) : renderEmptyState('album', 'Sin álbumes con los filtros actuales')}
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('repertoire')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">description</span>
              Repertorios
            </h2>
          </div>
          <div className="search-page__repertoire-list">
            {grouped.repertoires.length > 0 ? grouped.repertoires.map((repertoire, index) => (
              <div key={repertoire.id} role="button" tabIndex={0} className="search-page__repertoire-card" onClick={() => navigateByItem(repertoire)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateByItem(repertoire); } }}>
                <div className={`search-page__repertoire-left-border ${repertoire.ownerUserId === currentUserId ? 'is-own' : ''}`}></div>
                <div className="search-page__repertoire-cover">
                  {repertoire.images && repertoire.images.length > 0 ? (
                    <Image src={repertoire.images[0].url} alt={`Portada de ${repertoire.title}`} width={64} height={64} priority={index === 0} />
                  ) : (
                    <span className="material-symbols-outlined search-page__repertoire-placeholder" aria-hidden="true">description</span>
                  )}
                </div>
                <div className="search-page__repertoire-main">
                  <div className="search-page__repertoire-header">
                    <strong>{highlightMatch(repertoire.title, debouncedQuery)}</strong>
                    <span className={`search-page__repertoire-badge ${repertoire.ownerUserId === currentUserId ? 'is-own' : 'is-public'}`}>
                      {repertoire.ownerUserId === currentUserId ? 'TU REPERTORIO' : repertoire.isPublic ? 'PÚBLICO' : 'PRIVADO'}
                    </span>
                  </div>
                  <small className="search-page__repertoire-date">Fecha: {repertoire.dateLabel}</small>
                </div>

                <div className="search-page__repertoire-stats">
                  <div className="search-page__repertoire-stat">
                    <span className="search-page__repertoire-stat-value">{repertoire.songsCount}</span>
                    <span className="search-page__repertoire-stat-label">Canciones</span>
                  </div>
                  <div className="search-page__repertoire-stat">
                    <span className="search-page__repertoire-stat-value">{repertoire.sheetsCount}</span>
                    <span className="search-page__repertoire-stat-label">Partituras</span>
                  </div>
                </div>

                <div className="search-page__repertoire-actions" aria-label="acciones de repertorio">
                  <button
                    type="button"
                    className={bookmarkedRepertoires.has(repertoire.id) ? 'is-bookmarked' : ''}
                    aria-label={bookmarkedRepertoires.has(repertoire.id) ? 'Quitar de guardados' : 'Guardar repertorio'}
                    aria-pressed={bookmarkedRepertoires.has(repertoire.id)}
                    onClick={(event) => void toggleBookmark(repertoire.id, event)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {bookmarkedRepertoires.has(repertoire.id) ? 'bookmark_added' : 'bookmark'}
                    </span>
                  </button>
                  {repertoire.ownerUserId === currentUserId ? (
                    <>
                      <button
                        type="button"
                        aria-label="Editar repertorio"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditrepertoire(repertoire);
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar repertorio"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleterepertoire(repertoire);
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )) : renderEmptyState('description', 'Sin repertorios con los filtros actuales')}
          </div>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('artist')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">person</span>
              Artistas
            </h2>
          </div>
          {grouped.artists.length > 0 ? (
            <HorizontalConveyor ariaLabel="Artistas" className="artists-conveyor" scrollStep={260}>
              <div className="artists-track">
                {grouped.artists.map((item, index) => (
                  <button key={item.id} type="button" className="artist-home-pill artist-card-interactive" onClick={() => navigateByItem(item)}>
                    {item.images && item.images.length > 0 ? (
                      <Image
                        src={item.images[0].url}
                        alt={resolveArtistName(item)}
                        className="artist-avatar-image"
                        width={62}
                        height={62}
                        priority={index === 0}
                      />
                    ) : (
                      <div className="artist-avatar">
                        <span className="material-symbols-outlined placeholder-icon-artist-section" aria-hidden="true">person</span>
                      </div>
                    )}
                    <small className="artist-name">{highlightMatch(resolveArtistName(item), debouncedQuery)}</small>
                  </button>
                ))}
              </div>
            </HorizontalConveyor>
          ) : renderEmptyState('person', 'Sin artistas con los filtros actuales')}
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('version')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">queue_music</span>
              Versiones
            </h2>
          </div>
          <div className="search-page__version-grid">
            {grouped.versions.length > 0 ? grouped.versions.map((item) => {
              const version = item as SearchVersionItem;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="search-page__version-card"
                  onClick={() => navigateByItem(item)}
                  aria-label={`Ver la versión ${item.title}`}
                >
                  <div className="search-page__version-header">
                    <strong>{highlightMatch(item.title, debouncedQuery)}</strong>
                    {version.isPremium && (
                      <span className="search-page__premium-badge">
                        <span className="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
                        Premium
                      </span>
                    )}
                  </div>
                  <span className="search-page__version-tag">{item.instrument}</span>
                  <div className="search-page__version-meta">
                    <small>{item.subtitle}</small>
                    {version.notationType && (
                      <span className="search-page__meta-dot">
                        <span className="material-symbols-outlined" aria-hidden="true">description</span>
                        {version.notationType}
                      </span>
                    )}
                    <span className="search-page__version-open-hint">
                      <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                      Ver canción
                    </span>
                  </div>
                </button>
              );
            }) : renderEmptyState('queue_music', 'Sin versiones con los filtros actuales')}
          </div>
        </section>
      </main>
    </section>
  );
}

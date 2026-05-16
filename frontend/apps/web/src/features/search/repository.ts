import { searchMockData } from './mockData';
import type {
  SearchAlbumItem,
  SearchArtistItem,
  SearchBucket,
  SearchBuckets,
  SearchDataset,
  SearchEntityItem,
  SearchEntityKind,
  SearchImage,
  SearchrepertoireItem,
  SearchSongItem,
  SearchVersionItem
} from '../../types/search';

interface SearchDatasetClientOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  scope?: 'home' | 'catalog';
}

interface SearchDatasetCacheEntry {
  dataset: SearchDataset;
  expiresAt: number;
}

const SEARCH_DATASET_CACHE_KEY_PREFIX = '__canticum_search_dataset_cache_v1__';
const SEARCH_DATASET_CACHE_TTL_MS = 60_000;
const SEARCH_DATASET_FETCH_TIMEOUT_MS = 8_500;
const MAX_NORMALIZED_ITEMS = 1_500;

const inMemorySearchDatasetCacheByScope = new Map<'home' | 'catalog', SearchDatasetCacheEntry>();
const inFlightSearchDatasetRequestByScope = new Map<'home' | 'catalog', Promise<SearchDataset>>();

function normalizeImages(raw: unknown): SearchImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const normalized = raw
    .map((entry): SearchImage | null => {
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (!url) return null;
      const width = Number(obj.width);
      const height = Number(obj.height);
      return {
        url,
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined
      };
    })
    .filter((value): value is SearchImage => value !== null);
  return normalized.length > 0 ? normalized : undefined;
}

function resolveArtistName(raw: Record<string, unknown>): string {
  const candidates = [raw.title, raw.name, raw.artistName, raw.displayName, raw.stageName, raw.authorOrChoir]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return candidates[0] ?? 'Artista';
}

function resolveArtistSubtitle(raw: Record<string, unknown>): string {
  const candidates = [raw.subtitle, raw.ministryType, raw.type, raw.liturgicalType]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const resolved = candidates[0] ?? 'General';
  const normalized = resolved.toLowerCase();
  if (normalized === 'unknown' || normalized === 'artista') {
    return 'General';
  }

  return resolved;
}

export async function getSearchDatasetClient(options: SearchDatasetClientOptions = {}): Promise<SearchDataset> {
  const { forceRefresh = false, timeoutMs = SEARCH_DATASET_FETCH_TIMEOUT_MS, scope = 'catalog' } = options;
  const cached = getCachedSearchDatasetClient(scope);

  if (!forceRefresh && cached) {
    return cached;
  }

  if (!forceRefresh) {
    const inFlightRequest = inFlightSearchDatasetRequestByScope.get(scope);
    if (inFlightRequest) {
      return inFlightRequest;
    }
  }

  if (!functionsBaseUrl) {
    return cached ?? searchMockData;
  }

  const requestPromise = (async (): Promise<SearchDataset> => {
    try {
      const token = await getAuthIdToken();
      const headers: Record<string, string> = {
        Accept: 'application/json'
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const endpoint = new URL(`${functionsBaseUrl}/search/catalog`);
        if (scope === 'home') {
          endpoint.searchParams.set('scope', 'home');
        }

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers,
          cache: 'no-store',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Search catalog request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as unknown;
        const normalized = normalizeDataset(payload) ?? searchMockData;
        writeSearchDatasetCache(normalized, scope);
        return normalized;
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch {
      return cached ?? searchMockData;
    } finally {
      inFlightSearchDatasetRequestByScope.delete(scope);
    }
  })();

  inFlightSearchDatasetRequestByScope.set(scope, requestPromise);
  return requestPromise;
}

export function getCachedSearchDatasetClient(scope: 'home' | 'catalog' = 'catalog'): SearchDataset | null {
  const now = Date.now();

  const inMemoryEntry = inMemorySearchDatasetCacheByScope.get(scope);
  if (inMemoryEntry && inMemoryEntry.expiresAt > now) {
    return inMemoryEntry.dataset;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getSearchDatasetCacheKey(scope));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SearchDatasetCacheEntry>;
    if (!parsed || typeof parsed !== 'object' || !parsed.dataset || typeof parsed.expiresAt !== 'number') {
      return null;
    }

    if (parsed.expiresAt <= now) {
      window.sessionStorage.removeItem(getSearchDatasetCacheKey(scope));
      return null;
    }

    const entry: SearchDatasetCacheEntry = {
      dataset: parsed.dataset,
      expiresAt: parsed.expiresAt
    };
    inMemorySearchDatasetCacheByScope.set(scope, entry);

    return parsed.dataset;
  } catch {
    return null;
  }
}

function writeSearchDatasetCache(dataset: SearchDataset, scope: 'home' | 'catalog'): void {
  const entry: SearchDatasetCacheEntry = {
    dataset,
    expiresAt: Date.now() + SEARCH_DATASET_CACHE_TTL_MS
  };

  inMemorySearchDatasetCacheByScope.set(scope, entry);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(getSearchDatasetCacheKey(scope), JSON.stringify(entry));
  } catch {
  }
}

function getSearchDatasetCacheKey(scope: 'home' | 'catalog'): string {
  return `${SEARCH_DATASET_CACHE_KEY_PREFIX}:${scope}`;
}

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

async function getAuthIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!hasFirebaseConfig) {
    return null;
  }

  try {
    const { auth } = await import('../../services/firebase');
    if (!auth.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function getClientCurrentUserId(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!hasFirebaseConfig) {
    return null;
  }

  try {
    const { auth } = await import('../../services/firebase');
    return auth.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function normalizeKind(value: unknown): SearchEntityKind {
  if (value === 'album' || value === 'repertoire' || value === 'artist' || value === 'version') {
    return value;
  }

  return 'song';
}

function normalizeDateLabel(value: unknown): string {
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      date = (value as { toDate: () => Date }).toDate();
    } catch {
      date = null;
    }
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') {
      return 'N/D';
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      return trimmed;
    }
  } else if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date) {
    return 'N/D';
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function normalizeItem(rawItem: Partial<SearchEntityItem> & Record<string, unknown>): SearchEntityItem {
  // Prefer `type` (Spotify-aligned) but fall back to legacy `kind` for backwards compatibility.
  const kind = normalizeKind(rawItem.type ?? rawItem.kind);

  const base = {
    id: String(rawItem.id ?? ''),
    title: String(rawItem.title ?? ''),
    subtitle: String(rawItem.subtitle ?? ''),
    songId: rawItem.songId ? String(rawItem.songId) : undefined,
    repertoireId: rawItem.repertoireId ? String(rawItem.repertoireId) : undefined,
    artistId: rawItem.artistId ? String(rawItem.artistId) : undefined,
    albumId: rawItem.albumId ? String(rawItem.albumId) : undefined,
    images: normalizeImages(rawItem.images),
    liturgicalType: String(rawItem.liturgicalType ?? 'General'),
    liturgicalTime: String(rawItem.liturgicalTime ?? 'Ordinario'),
    authorOrChoir: String(rawItem.authorOrChoir ?? 'General'),
    searchableText: String(rawItem.searchableText ?? `${rawItem.title ?? ''} ${rawItem.subtitle ?? ''}`)
  };

  if (kind === 'album') {
    const releaseYearRaw = Number(rawItem.releaseYear);
    return {
      ...base,
      kind: 'album',
      type: 'album',
      albumId: String(rawItem.albumId ?? rawItem.id ?? ''),
      albumType: String(rawItem.albumType ?? 'album'),
      releaseYear: Number.isFinite(releaseYearRaw) && releaseYearRaw > 0 ? releaseYearRaw : undefined,
      totalTracks: Number(rawItem.totalTracks ?? 0),
      artistName: String(rawItem.artistName ?? base.authorOrChoir)
    };
  }

  if (kind === 'repertoire') {
    return {
      ...base,
      kind: 'repertoire',
      type: 'repertoire',
      status: typeof rawItem.status === 'string' ? rawItem.status : undefined,
      dateLabel: normalizeDateLabel(rawItem.dateLabel),
      songsCount: Number(rawItem.songsCount ?? 0),
      sheetsCount: Number(rawItem.sheetsCount ?? 0),
      ownerUserId: String(rawItem.ownerUserId ?? rawItem.userId ?? 'unknown-user'),
      isPublic: Boolean(rawItem.isPublic),
      isTrending: Boolean(rawItem.isTrending)
    };
  }

  if (kind === 'artist') {
    const artistName = resolveArtistName(rawItem);
    const artistSubtitle = resolveArtistSubtitle(rawItem);
    return {
      ...base,
      kind: 'artist',
      type: 'artist',
      title: artistName,
      subtitle: artistSubtitle,
      authorOrChoir: artistName,
      searchableText: `${artistName} ${artistSubtitle} ${String(rawItem.searchableText ?? '')}`.trim(),
      songsCount: Number(rawItem.songsCount ?? 0)
    };
  }

  if (kind === 'version') {
    return {
      ...base,
      kind: 'version',
      type: 'version',
      instrument: String(rawItem.instrument ?? 'General'),
      notationType: String(rawItem.notationType ?? 'Cifrado'),
      isPremium: Boolean(rawItem.isPremium)
    };
  }

  return {
    ...base,
    kind: 'song',
    type: 'song',
    status: typeof rawItem.status === 'string' ? rawItem.status : undefined,
    isPremium: Boolean(rawItem.isPremium),
    popularity: Number.isFinite(Number(rawItem.popularity)) ? Number(rawItem.popularity) : undefined,
    totalViews: Number.isFinite(Number(rawItem.totalViews)) ? Number(rawItem.totalViews) : undefined,
    likeCount: Number.isFinite(Number(rawItem.likeCount)) ? Number(rawItem.likeCount) : undefined,
    publishedAt: typeof rawItem.publishedAt === 'string' ? rawItem.publishedAt : null,
    createdAt: typeof rawItem.createdAt === 'string' ? rawItem.createdAt : null,
    ownerUserId: typeof rawItem.ownerUserId === 'string' ? rawItem.ownerUserId : undefined
  };
}

function normalizeBucket<T extends SearchEntityItem>(
  raw: unknown,
  kindGuard: (item: SearchEntityItem) => item is T
): SearchBucket<T> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return undefined;

  const items = obj.items
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => normalizeItem(entry))
    .filter(kindGuard);

  return {
    href: typeof obj.href === 'string' ? obj.href : null,
    limit: Number.isFinite(Number(obj.limit)) ? Number(obj.limit) : items.length,
    offset: Number.isFinite(Number(obj.offset)) ? Number(obj.offset) : 0,
    total: Number.isFinite(Number(obj.total)) ? Number(obj.total) : items.length,
    next: typeof obj.next === 'string' ? obj.next : null,
    previous: typeof obj.previous === 'string' ? obj.previous : null,
    items
  };
}

function deriveBucketsFromItems(items: SearchEntityItem[]): SearchBuckets {
  const byKind = <T extends SearchEntityItem>(kind: SearchEntityKind): SearchBucket<T> => {
    const list = items.filter((item): item is T => item.kind === kind);
    return { href: null, limit: list.length, offset: 0, total: list.length, next: null, previous: null, items: list };
  };

  return {
    songs: byKind<SearchSongItem>('song'),
    albums: byKind<SearchAlbumItem>('album'),
    repertoires: byKind<SearchrepertoireItem>('repertoire'),
    artists: byKind<SearchArtistItem>('artist'),
    versions: byKind<SearchVersionItem>('version')
  };
}

function normalizeDataset(rawData: unknown): SearchDataset | null {
  if (!rawData || typeof rawData !== 'object') {
    return null;
  }

  const candidate = rawData as Record<string, unknown>;
  const wrapped = (candidate.data as Record<string, unknown> | undefined) ?? candidate;

  // Spotify-style buckets: if present, they are the source of truth for paged results.
  const rawBuckets = wrapped.buckets && typeof wrapped.buckets === 'object'
    ? (wrapped.buckets as Record<string, unknown>)
    : undefined;

  let buckets: SearchBuckets | undefined;
  if (rawBuckets) {
    buckets = {
      songs: normalizeBucket<SearchSongItem>(rawBuckets.songs, (item): item is SearchSongItem => item.kind === 'song'),
      albums: normalizeBucket<SearchAlbumItem>(rawBuckets.albums, (item): item is SearchAlbumItem => item.kind === 'album'),
      repertoires: normalizeBucket<SearchrepertoireItem>(rawBuckets.repertoires, (item): item is SearchrepertoireItem => item.kind === 'repertoire'),
      artists: normalizeBucket<SearchArtistItem>(rawBuckets.artists, (item): item is SearchArtistItem => item.kind === 'artist'),
      versions: normalizeBucket<SearchVersionItem>(rawBuckets.versions, (item): item is SearchVersionItem => item.kind === 'version')
    };
  }

  const rawItems = Array.isArray(wrapped.items)
    ? wrapped.items
    : Array.isArray(wrapped.results)
      ? wrapped.results
      : null;

  let items: SearchEntityItem[];
  if (rawItems) {
    items = rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => normalizeItem(item));

    if (items.length > MAX_NORMALIZED_ITEMS) {
      items = items.slice(0, MAX_NORMALIZED_ITEMS);
    }
  } else if (buckets) {
    // Flatten buckets into a single items array for legacy UI consumers.
    items = [
      ...(buckets.songs?.items ?? []),
      ...(buckets.albums?.items ?? []),
      ...(buckets.repertoires?.items ?? []),
      ...(buckets.artists?.items ?? []),
      ...(buckets.versions?.items ?? [])
    ];

    if (items.length > MAX_NORMALIZED_ITEMS) {
      items = items.slice(0, MAX_NORMALIZED_ITEMS);
    }
  } else {
    return null;
  }

  if (!buckets) {
    buckets = deriveBucketsFromItems(items);
  }

  const rawFilters = (wrapped.filters as Record<string, unknown> | undefined) ?? {};

  return {
    filters: {
      liturgicalTypes: Array.isArray(rawFilters.liturgicalTypes)
        ? rawFilters.liturgicalTypes.map((value) => String(value))
        : searchMockData.filters.liturgicalTypes,
      liturgicalTimes: Array.isArray(rawFilters.liturgicalTimes)
        ? rawFilters.liturgicalTimes.map((value) => String(value))
        : searchMockData.filters.liturgicalTimes,
      authorOrChoirs: Array.isArray(rawFilters.authorOrChoirs)
        ? rawFilters.authorOrChoirs.map((value) => String(value))
        : searchMockData.filters.authorOrChoirs
    },
    items,
    buckets
  };
}

export async function getSearchDataset(): Promise<SearchDataset> {
  if (!functionsBaseUrl) {
    return searchMockData;
  }

  try {
    const response = await fetch(`${functionsBaseUrl}/search/catalog`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Search catalog request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const normalized = normalizeDataset(payload);
    return normalized ?? searchMockData;
  } catch {
    return searchMockData;
  }
}

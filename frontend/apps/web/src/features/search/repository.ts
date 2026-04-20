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
  SearchSchemaItem,
  SearchSongItem,
  SearchVersionItem
} from '../../types/search';

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

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

function normalizeKind(value: unknown): SearchEntityKind {
  if (value === 'album' || value === 'schema' || value === 'artist' || value === 'version') {
    return value;
  }

  return 'song';
}

function normalizeItem(rawItem: Partial<SearchEntityItem> & Record<string, unknown>): SearchEntityItem {
  // Prefer `type` (Spotify-aligned) but fall back to legacy `kind` for backwards compatibility.
  const kind = normalizeKind(rawItem.type ?? rawItem.kind);

  const base = {
    id: String(rawItem.id ?? ''),
    title: String(rawItem.title ?? ''),
    subtitle: String(rawItem.subtitle ?? ''),
    songId: rawItem.songId ? String(rawItem.songId) : undefined,
    schemaId: rawItem.schemaId ? String(rawItem.schemaId) : undefined,
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

  if (kind === 'schema') {
    return {
      ...base,
      kind: 'schema',
      type: 'schema',
      dateLabel: String(rawItem.dateLabel ?? 'N/D'),
      songsCount: Number(rawItem.songsCount ?? 0),
      sheetsCount: Number(rawItem.sheetsCount ?? 0),
      ownerUserId: String(rawItem.ownerUserId ?? rawItem.userId ?? 'unknown-user'),
      isPublic: Boolean(rawItem.isPublic),
      isTrending: Boolean(rawItem.isTrending)
    };
  }

  if (kind === 'artist') {
    return {
      ...base,
      kind: 'artist',
      type: 'artist',
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
    isPremium: Boolean(rawItem.isPremium)
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
    schemas: byKind<SearchSchemaItem>('schema'),
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
      schemas: normalizeBucket<SearchSchemaItem>(rawBuckets.schemas, (item): item is SearchSchemaItem => item.kind === 'schema'),
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
  } else if (buckets) {
    // Flatten buckets into a single items array for legacy UI consumers.
    items = [
      ...(buckets.songs?.items ?? []),
      ...(buckets.albums?.items ?? []),
      ...(buckets.schemas?.items ?? []),
      ...(buckets.artists?.items ?? []),
      ...(buckets.versions?.items ?? [])
    ];
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

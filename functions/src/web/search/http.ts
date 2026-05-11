import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { getOptionalAuthContext, getPathSegments, handlePreflight, sendError, sendJson } from '../../shared/http/http';
import { listTopArtists as listTopArtistsInCloudSql, searchArtists as searchArtistsInCloudSql } from '../../shared/cloudSql/artists';
import { getSongMetricsBySqlIds, listTopSongs as listTopSongsInCloudSql } from '../../shared/cloudSql/songs';

type SearchKind = 'song' | 'album' | 'repertoire' | 'artist' | 'version';

interface SearchImage {
  url: string;
  width?: number;
  height?: number;
}

interface SearchItem {
  id: string;
  kind: SearchKind;
  /** Spotify-aligned type discriminator (mirrors `kind`). */
  type: SearchKind;
  title: string;
  subtitle: string;
  songId?: string;
  repertoireId?: string;
  artistId?: string;
  albumId?: string;
  images?: SearchImage[];
  liturgicalType: string;
  liturgicalTime: string;
  authorOrChoir: string;
  searchableText: string;
  isPremium?: boolean;
  popularity?: number;
  totalViews?: number;
  likeCount?: number;
  publishedAt?: string | null;
  createdAt?: string | null;
  dateLabel?: string;
  songsCount?: number;
  sheetsCount?: number;
  ownerUserId?: string;
  isPublic?: boolean;
  status?: string;
  instrument?: string;
  notationType?: string;
  albumType?: string;
  releaseYear?: number;
  totalTracks?: number;
  artistName?: string;
}

function computePopularity(raw: unknown, totalViews: number): number {
  const stored = Number(raw);
  if (Number.isFinite(stored) && stored >= 0) return Math.min(100, Math.round(stored));
  if (!Number.isFinite(totalViews) || totalViews <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.log10(totalViews + 1) * 20)));
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object' && 'toDate' in (value as Record<string, unknown>) && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const seconds = Number((value as { _seconds?: unknown; seconds?: unknown })._seconds ?? (value as { seconds?: unknown }).seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    const d = new Date(seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function pushSongItemIfMatch(
  songs: SearchItem[],
  seenSongIds: Set<string>,
  seenSqlSongIds: Set<number>,
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  query: string,
  sqlSongMetricsBySqlSongId: Map<number, { totalViews: number; likeCount: number; popularity: number }>
): void {
  if (seenSongIds.has(doc.id)) {
    return;
  }

  const data = doc.data() as Record<string, unknown>;
  const sqlSongId = Number(data.sqlSongId);
  const normalizedSqlSongId = Number.isFinite(sqlSongId) && sqlSongId > 0 ? Math.floor(sqlSongId) : null;

  if (normalizedSqlSongId && seenSqlSongIds.has(normalizedSqlSongId)) {
    return;
  }

  const sqlMetrics = Number.isFinite(sqlSongId) && sqlSongId > 0
    ? sqlSongMetricsBySqlSongId.get(Math.floor(sqlSongId))
    : undefined;
  const totalViewsNum = Number(sqlMetrics?.totalViews ?? data.totalViews ?? 0) || 0;
  const likeCountNum = Number(sqlMetrics?.likeCount ?? data.likeCount ?? 0) || 0;
  const popularityNum = Number(sqlMetrics?.popularity ?? data.popularity ?? computePopularity(undefined, totalViewsNum)) || computePopularity(undefined, totalViewsNum);
  const publishedAtIso = toIsoString(data.publishedAt);
  const createdAtIso = toIsoString(data.createdAt);
  const item: SearchItem = {
    id: doc.id,
    kind: 'song',
    type: 'song',
    title: String(data.title ?? ''),
    subtitle: String(data.author ?? data.artistName ?? ''),
    songId: doc.id,
    images: normalizeImages(data.images, typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined),
    liturgicalType: String(data.liturgicalType ?? data.liturgical_use ?? 'General'),
    liturgicalTime: String(data.liturgicalTime ?? 'Ordinario'),
    authorOrChoir: String(data.author ?? data.artistName ?? 'General'),
    searchableText: `${String(data.title ?? '')} ${String(data.author ?? data.artistName ?? '')}`.trim(),
    isPremium: Boolean(data.isPremium),
    popularity: popularityNum,
    totalViews: totalViewsNum,
    likeCount: likeCountNum,
    publishedAt: publishedAtIso,
    createdAt: createdAtIso,
    ownerUserId: String(data.ownerUserId ?? data.createdBy ?? ''),
    status: String(data.status ?? 'DRAFT').toUpperCase()
  };

  if (matchesQuery(item, query)) {
    songs.push(item);
    seenSongIds.add(doc.id);
    if (normalizedSqlSongId) {
      seenSqlSongIds.add(normalizedSqlSongId);
    }
  }
}

interface SearchBucket<T> {
  href: string | null;
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
  items: T[];
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const FIRESTORE_CATALOG_SCAN_LIMIT = 120;
const SHARED_HOME_CACHE_TTL_MS = 30_000;
const HOME_SCOPE_FIRESTORE_SCAN_LIMIT = 80;
const HOME_SCOPE_SQL_SONG_LIMIT = 60;
const HOME_SCOPE_SQL_ARTIST_LIMIT = 40;

interface SearchCatalogResponse {
  buckets: {
    songs: SearchBucket<SearchItem>;
    albums: SearchBucket<SearchItem>;
    repertoires: SearchBucket<SearchItem>;
    artists: SearchBucket<SearchItem>;
    versions: SearchBucket<SearchItem>;
  };
  items: SearchItem[];
  filters: {
    liturgicalTypes: string[];
    liturgicalTimes: string[];
    authorOrChoirs: string[];
  };
}

let sharedHomeCatalogCache: { payload: SearchCatalogResponse; expiresAt: number } | null = null;

function parsePositiveInt(value: unknown, fallback: number, max: number = Number.POSITIVE_INFINITY): number {
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function normalizeImages(raw: unknown, fallbackUrl?: string): SearchImage[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw
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
    if (list.length > 0) return list;
  }
  return fallbackUrl ? [{ url: fallbackUrl }] : undefined;
}

function buildBucket<T extends SearchItem>(
  items: T[],
  offset: number,
  limit: number,
  baseHref: string
): SearchBucket<T> {
  const total = items.length;
  const sliced = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const prevOffset = offset - limit;
  return {
    href: `${baseHref}&offset=${offset}&limit=${limit}`,
    limit,
    offset,
    total,
    next: nextOffset < total ? `${baseHref}&offset=${nextOffset}&limit=${limit}` : null,
    previous: offset > 0 && prevOffset >= 0 ? `${baseHref}&offset=${prevOffset}&limit=${limit}` : null,
    items: sliced
  };
}

function matchesQuery(item: SearchItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.title} ${item.subtitle} ${item.searchableText}`.toLowerCase();
  return haystack.includes(query);
}

function formatDateLabel(value: unknown): string {
  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      date = ((value as { toDate: () => Date }).toDate());
    } catch {
      date = null;
    }
  } else if (typeof value === 'string' || typeof value === 'number') {
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

export const search = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const segments = getPathSegments(req);

  if (segments.length !== 1 || segments[0] !== 'catalog') {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const auth = await getOptionalAuthContext(req);
  const currentUserId = auth?.uid ?? null;
  const db = getAppFirestore();

  // Accept Spotify-style `type=song,album,repertoire,artist,version` AND legacy `kind=song`.
  const typeParam = typeof req.query.type === 'string' ? req.query.type : '';
  const legacyKindParam = typeof req.query.kind === 'string' ? req.query.kind : '';
  const kindFilters = new Set(
    (typeParam || legacyKindParam)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is SearchKind => s === 'song' || s === 'album' || s === 'repertoire' || s === 'artist' || s === 'version')
  );
  const wants = (kind: SearchKind): boolean => kindFilters.size === 0 || kindFilters.has(kind);

  const query = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parsePositiveInt(req.query.offset, 0);
  const scopeParam = typeof req.query.scope === 'string' ? req.query.scope.trim().toLowerCase() : '';
  const isHomeScope = scopeParam === 'home';
  const firestoreScanLimit = isHomeScope ? HOME_SCOPE_FIRESTORE_SCAN_LIMIT : FIRESTORE_CATALOG_SCAN_LIMIT;
  const canUseSharedHomeCache = isHomeScope && !currentUserId && !query && kindFilters.size === 0 && offset === 0 && limit === DEFAULT_LIMIT;

  if (canUseSharedHomeCache && sharedHomeCatalogCache && sharedHomeCatalogCache.expiresAt > Date.now()) {
    sendJson(res, 200, sharedHomeCatalogCache.payload);
    return;
  }

  const sqlTopSongsPromise = wants('song') && !query
    ? listTopSongsInCloudSql(isHomeScope ? HOME_SCOPE_SQL_SONG_LIMIT : 100).catch((error) => {
      console.error('Cloud SQL top songs merge failed in search/catalog:', error);
      return null;
    })
    : Promise.resolve(null);

  const sqlArtistsPromise = wants('artist')
    ? (query
      ? searchArtistsInCloudSql(query, isHomeScope ? HOME_SCOPE_SQL_ARTIST_LIMIT : 50)
      : listTopArtistsInCloudSql(isHomeScope ? HOME_SCOPE_SQL_ARTIST_LIMIT : 50)
    ).catch((error) => {
      console.error('Cloud SQL artist merge failed in search/catalog:', error);
      return null;
    })
    : Promise.resolve(null);

  const emptySnap = { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };

  const [publishedSongsSnap, ownerSongsByOwnerIdSnap, ownerSongsByCreatedBySnap, albumsSnap, repertoiresSnap, artistsSnap] = await Promise.all([
    wants('song')
      ? db.collection('songs').where('status', '==', 'PUBLISHED').orderBy('publishedAt', 'desc').limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap),
    wants('song') && currentUserId
      ? db.collection('songs').where('ownerUserId', '==', currentUserId).limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap),
    wants('song') && currentUserId
      ? db.collection('songs').where('createdBy', '==', currentUserId).limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap),
    wants('album')
      ? db.collection('albums').where('status', '==', 'PUBLISHED').limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap),
    wants('repertoire')
      ? db.collection('repertoires').limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap),
    wants('artist')
      ? db.collection('artists').limit(firestoreScanLimit).get()
      : Promise.resolve(emptySnap)
  ]);

  const songs: SearchItem[] = [];
  const seenSongIds = new Set<string>();
  const seenSqlSongIds = new Set<number>();
  const albums: SearchItem[] = [];
  const repertoires: SearchItem[] = [];
  const artists: SearchItem[] = [];
  const versions: SearchItem[] = []; // reserved for future SearchService

  const allSongDocs = [
    ...publishedSongsSnap.docs,
    ...ownerSongsByOwnerIdSnap.docs,
    ...ownerSongsByCreatedBySnap.docs
  ];
  const sqlSongIds = allSongDocs
    .map((doc) => Number((doc.data() as Record<string, unknown>).sqlSongId))
    .filter((id) => Number.isFinite(id) && id > 0)
    .map((id) => Math.floor(id));

  const sqlSongMetricsBySqlSongId = await getSongMetricsBySqlIds(sqlSongIds);

  publishedSongsSnap.docs.forEach((doc) => {
    pushSongItemIfMatch(songs, seenSongIds, seenSqlSongIds, doc, query, sqlSongMetricsBySqlSongId);
  });

  ownerSongsByOwnerIdSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (String(data.status ?? '').toUpperCase() === 'DRAFT') {
      pushSongItemIfMatch(songs, seenSongIds, seenSqlSongIds, doc, query, sqlSongMetricsBySqlSongId);
    }
  });

  ownerSongsByCreatedBySnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (String(data.status ?? '').toUpperCase() === 'DRAFT') {
      pushSongItemIfMatch(songs, seenSongIds, seenSqlSongIds, doc, query, sqlSongMetricsBySqlSongId);
    }
  });

  const sqlTopSongs = await sqlTopSongsPromise;
  if (sqlTopSongs) {
    sqlTopSongs.forEach((row) => {
      if (seenSqlSongIds.has(row.sqlSongId)) {
        return;
      }

      songs.push({
        id: String(row.sqlSongId),
        kind: 'song',
        type: 'song',
        songId: String(row.sqlSongId),
        title: row.title,
        subtitle: String(row.artistName ?? ''),
        liturgicalType: 'General',
        liturgicalTime: 'Ordinario',
        authorOrChoir: String(row.artistName ?? 'General'),
        searchableText: `${row.title} ${String(row.artistName ?? '')}`.trim(),
        popularity: row.popularity,
        totalViews: row.totalViews,
        likeCount: row.likeCount
      });

      seenSqlSongIds.add(row.sqlSongId);
      seenSongIds.add(String(row.sqlSongId));
    });
  }

  albumsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const artistName = String(data.artistName ?? '');
    const item: SearchItem = {
      id: doc.id,
      kind: 'album',
      type: 'album',
      albumId: doc.id,
      artistId: typeof data.artistId === 'string' ? (data.artistId as string) : undefined,
      title: String(data.title ?? ''),
      subtitle: `${String(data.albumType ?? 'album')} · ${artistName}`.trim(),
      images: normalizeImages(data.images, typeof data.coverUrl === 'string' ? data.coverUrl : undefined),
      albumType: String(data.albumType ?? 'album'),
      releaseYear: Number.isFinite(Number(data.releaseYear)) ? Number(data.releaseYear) : undefined,
      totalTracks: Number(data.totalTracks ?? data.songsCount ?? 0),
      artistName,
      liturgicalType: 'General',
      liturgicalTime: 'Ordinario',
      authorOrChoir: artistName || 'General',
      searchableText: `${String(data.title ?? '')} ${artistName}`.trim()
    };
    if (matchesQuery(item, query)) albums.push(item);
  });

  repertoiresSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const ownerUserId = String(data.userId ?? data.ownerUserId ?? '');
    const isPublic = Boolean(data.isPublic ?? data.visibility === 'public');

    if (!isPublic && ownerUserId !== currentUserId) {
      return;
    }

    const songIds = Array.isArray(data.songIds) ? data.songIds : [];

    const item: SearchItem = {
      id: doc.id,
      kind: 'repertoire',
      type: 'repertoire',
      repertoireId: doc.id,
      title: String(data.title ?? ''),
      subtitle: String(data.liturgicalType ?? data.type ?? 'repertorio'),
      images: normalizeImages(
        data.images,
        typeof data.coverImageUrl === 'string'
          ? data.coverImageUrl
          : typeof data.coverUrl === 'string'
            ? data.coverUrl
            : undefined
      ),
      liturgicalType: String(data.liturgicalType ?? data.type ?? 'General'),
      liturgicalTime: String(data.liturgicalTime ?? 'Ordinario'),
      authorOrChoir: 'repertoire',
      searchableText: `${String(data.title ?? '')} ${String(data.liturgicalType ?? data.type ?? '')}`.trim(),
      dateLabel: formatDateLabel(data.updatedAt ?? data.createdAt),
      songsCount: Number(data.songsCount ?? songIds.length),
      sheetsCount: Number(data.sheetsCount ?? 0),
      ownerUserId,
      isPublic,
      status: String(data.status ?? (isPublic ? 'PUBLISHED' : 'DRAFT')).toUpperCase()
    };
    if (matchesQuery(item, query)) repertoires.push(item);
  });

  artistsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const item: SearchItem = {
      id: doc.id,
      kind: 'artist',
      type: 'artist',
      artistId: doc.id,
      title: String(data.name ?? ''),
      subtitle: String(data.ministryType ?? data.type ?? 'Artista'),
      images: normalizeImages(data.images, typeof data.imageUrl === 'string' ? data.imageUrl : undefined),
      liturgicalType: 'General',
      liturgicalTime: 'Ordinario',
      authorOrChoir: String(data.name ?? ''),
      searchableText: `${String(data.name ?? '')} ${String(data.bio ?? '')}`.trim(),
      songsCount: Number(data.songsCount ?? 0)
    };
    if (matchesQuery(item, query)) artists.push(item);
  });

  const sqlArtists = await sqlArtistsPromise;
  if (sqlArtists) {
    const seenArtistIds = new Set(artists.map((item) => item.artistId ?? item.id));

    sqlArtists.forEach((artist) => {
      const artistId = String(artist.id);
      if (seenArtistIds.has(artistId)) {
        return;
      }

      const item: SearchItem = {
        id: artistId,
        kind: 'artist',
        type: 'artist',
        artistId,
        title: artist.name,
        subtitle: artist.type || 'Artista',
        images: artist.imageUrl ? [{ url: artist.imageUrl }] : undefined,
        liturgicalType: 'General',
        liturgicalTime: 'Ordinario',
        authorOrChoir: artist.name,
        searchableText: `${artist.name} ${artist.type}`.trim(),
        songsCount: 0
      };

      if (matchesQuery(item, query)) {
        artists.push(item);
        seenArtistIds.add(artistId);
      }
    });
  }

  const songsForResponse = isHomeScope ? songs.slice(0, 80) : songs;
  const albumsForResponse = isHomeScope ? albums.slice(0, 30) : albums;
  const repertoiresForResponse = isHomeScope ? repertoires.slice(0, 40) : repertoires;
  const artistsForResponse = isHomeScope ? artists.slice(0, 50) : artists;
  const versionsForResponse = isHomeScope ? versions.slice(0, 20) : versions;

  const items: SearchItem[] = [
    ...songsForResponse,
    ...albumsForResponse,
    ...repertoiresForResponse,
    ...artistsForResponse,
    ...versionsForResponse
  ];

  const liturgicalTypes = new Set<string>();
  const liturgicalTimes = new Set<string>();
  const authorOrChoirs = new Set<string>();

  items.forEach((item) => {
    liturgicalTypes.add(item.liturgicalType || 'General');
    liturgicalTimes.add(item.liturgicalTime || 'Ordinario');
    authorOrChoirs.add(item.authorOrChoir || 'General');
  });

  // Build Spotify-style paged buckets. Href uses a normalized query string so
  // clients can follow `next`/`previous` without rebuilding it themselves.
  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  if (typeParam) qs.set('type', typeParam);
  if (isHomeScope) qs.set('scope', 'home');
  const baseHref = `/search/catalog?${qs.toString()}`;

  const buckets = {
    songs: buildBucket(songsForResponse, offset, limit, baseHref),
    albums: buildBucket(albumsForResponse, offset, limit, baseHref),
    repertoires: buildBucket(repertoiresForResponse, offset, limit, baseHref),
    artists: buildBucket(artistsForResponse, offset, limit, baseHref),
    versions: buildBucket(versionsForResponse, offset, limit, baseHref)
  };

  const payload: SearchCatalogResponse = {
    // Spotify-aligned paged envelopes
    buckets,
    // Back-compat flat list used by existing UI (client-side filtering)
    items,
    filters: {
      liturgicalTypes: Array.from(liturgicalTypes),
      liturgicalTimes: Array.from(liturgicalTimes),
      authorOrChoirs: Array.from(authorOrChoirs)
    }
  };

  if (canUseSharedHomeCache) {
    sharedHomeCatalogCache = {
      payload,
      expiresAt: Date.now() + SHARED_HOME_CACHE_TTL_MS
    };
  }

  sendJson(res, 200, payload);
});

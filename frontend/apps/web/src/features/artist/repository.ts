import { artistMockById, artistrepertoiresMock } from './mockData';
import { readClientCache, writeClientCache } from '../shared/clientCache';
import type {
  ArtistDetail,
  ArtistDiscographyItem,
  ArtistImage,
  ArtistrepertoireRef,
  ArtistSongRow,
  SuggestedArtistItem
} from '../../types/artist';

function computePopularity(totalViews: number): number {
  if (!Number.isFinite(totalViews) || totalViews <= 0) {
    return 0;
  }

  const score = Math.round(Math.log10(totalViews + 1) * 20);
  return Math.max(0, Math.min(100, score));
}

function normalizeImages(raw: Record<string, unknown>): ArtistImage[] {
  const list = raw.images;
  if (Array.isArray(list)) {
    const normalized = list
      .map((item): ArtistImage | null => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const url = typeof entry.url === 'string' ? entry.url : '';
        if (!url) return null;
        const width = Number(entry.width);
        const height = Number(entry.height);
        return {
          url,
          width: Number.isFinite(width) && width > 0 ? width : undefined,
          height: Number.isFinite(height) && height > 0 ? height : undefined
        };
      })
      .filter((value): value is ArtistImage => value !== null);
    if (normalized.length > 0) return normalized;
  }
  const fallback = typeof raw.imageUrl === 'string' && raw.imageUrl ? raw.imageUrl : '';
  return fallback ? [{ url: fallback }] : [];
}

const functionsBaseUrl = [
  process.env.GCP_FUNCTIONS_BASE_URL,
  process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL
]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find((value) => value.length > 0)?.replace(/\/$/, '') ?? '';

const ARTIST_DETAIL_CACHE_PREFIX = 'canticum:artist:detail:v1:';
const ARTIST_DETAIL_CACHE_TTL_MS = 300_000;
const ARTIST_FAVORITE_CACHE_PREFIX = 'canticum:artist:favorite:v1:';

function getArtistDetailCacheKey(artistId: string): string {
  return `${ARTIST_DETAIL_CACHE_PREFIX}${artistId}`;
}

function getArtistFavoriteStorageKey(artistId: string): string {
  return `${ARTIST_FAVORITE_CACHE_PREFIX}${artistId}`;
}

async function getServerSessionToken(): Promise<string | null> {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { cookies } = await import('next/headers');
    return cookies().get('__session')?.value ?? null;
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const { auth } = await import('../../services/firebase');
    if (!auth?.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function buildArtistHeaders(baseHeaders: Record<string, string>): Promise<Record<string, string>> {
  const clientToken = await getAuthToken();
  if (clientToken) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${clientToken}`
    };
  }

  const serverToken = await getServerSessionToken();
  if (serverToken) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${serverToken}`
    };
  }

  return baseHeaders;
}

function normalizeSongRow(raw: Record<string, unknown>): ArtistSongRow {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' && raw.thumbnailUrl ? raw.thumbnailUrl : undefined,
    views: Number(raw.views ?? 0),
    tone: String(raw.tone ?? ''),
    hasLyrics: Boolean(raw.hasLyrics),
    hasSheet: Boolean(raw.hasSheet),
    isVerified: Boolean(raw.isVerified),
    moderationState: typeof raw.moderationState === 'string' ? raw.moderationState : undefined,
    reviewStatus: raw.reviewStatus === 'reviewed' ? 'reviewed' : 'pending'
  };
}

function normalizeDiscographyItem(raw: Record<string, unknown>, index: number): ArtistDiscographyItem {
  const year = Number(raw.year);
  const currentYear = new Date().getFullYear();

  return {
    id: String(raw.id ?? `discography-${index}`),
    title: String(raw.title ?? 'Sin título'),
    year: Number.isFinite(year) ? year : currentYear,
    coverUrl: typeof raw.coverUrl === 'string' && raw.coverUrl ? raw.coverUrl : undefined,
    songId: typeof raw.songId === 'string' && raw.songId ? raw.songId : undefined,
    albumId: typeof raw.albumId === 'string' && raw.albumId ? raw.albumId : undefined,
    moderationState: typeof raw.moderationState === 'string' ? raw.moderationState : undefined,
    reviewStatus: raw.reviewStatus === 'reviewed' ? 'reviewed' : 'pending'
  };
}

function resolveArtistName(raw: Record<string, unknown>, fallback: string): string {
  const candidates = [raw.name, raw.artistName, raw.displayName, raw.stageName]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return candidates[0] ?? fallback;
}

function hasMeaningfulArtistName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'artista' && normalized !== 'artista sugerido';
}

function normalizeSuggestedArtist(raw: Record<string, unknown>, index: number): SuggestedArtistItem {
  const images = normalizeImages(raw);
  return {
    id: String(raw.id ?? `suggested-${index}`),
    name: resolveArtistName(raw, 'Artista sugerido'),
    imageUrl: images[0]?.url,
    images: images.length > 0 ? images : undefined
  };
}

function normalizeArtistDetail(raw: Record<string, unknown>): ArtistDetail {
  const songs: ArtistSongRow[] = Array.isArray(raw.songs)
    ? (raw.songs as unknown[])
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map(normalizeSongRow)
        .filter((s) => s.id.length > 0)
    : [];

  const highlightedSongs: string[] = Array.isArray(raw.highlightedSongs)
    ? (raw.highlightedSongs as unknown[]).filter((v): v is string => typeof v === 'string')
    : songs.slice(0, 6).map((s) => s.id);

  const totalViewsFromSongs = songs.reduce((acc, song) => acc + song.views, 0);
  const totalViews = Number(raw.totalViews ?? totalViewsFromSongs);
  const likeCount = Number(raw.likeCount ?? 0);

  const genres: string[] = Array.isArray(raw.genres)
    ? (raw.genres as unknown[])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    : [];

  const discography: ArtistDiscographyItem[] = Array.isArray(raw.discography)
    ? (raw.discography as unknown[])
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map(normalizeDiscographyItem)
    : songs.slice(0, 5).map((song, index) => ({
      id: `discography-${song.id}`,
      title: song.title,
      year: new Date().getFullYear() - (index + 3),
      coverUrl: song.thumbnailUrl,
      songId: song.id
    }));

  const suggestedArtists: SuggestedArtistItem[] = Array.isArray(raw.suggestedArtists)
    ? (raw.suggestedArtists as unknown[])
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map(normalizeSuggestedArtist)
    : [];

  const ministryType = String(raw.ministryType ?? 'General');
  const images = normalizeImages(raw);
  const resolvedLikeCount = Number.isFinite(likeCount) ? likeCount : 0;
  const resolvedTotalViews = Number.isFinite(totalViews) ? totalViews : totalViewsFromSongs;

  const followersRaw = raw.followers && typeof raw.followers === 'object'
    ? Number((raw.followers as Record<string, unknown>).total)
    : NaN;
  const followersTotal = Number.isFinite(followersRaw) ? followersRaw : resolvedLikeCount;

  const popularityRaw = Number(raw.popularity);
  const popularity = Number.isFinite(popularityRaw) && popularityRaw >= 0
    ? Math.max(0, Math.min(100, Math.round(popularityRaw)))
    : computePopularity(resolvedTotalViews);

  return {
    type: 'artist',
    id: String(raw.id ?? ''),
    name: resolveArtistName(raw, 'Artista'),
    bio: String(raw.bio ?? ''),
    ministryType,
    images,
    imageUrl: images[0]?.url,
    songsCount: Number(raw.songsCount ?? songs.length),
    likeCount: resolvedLikeCount,
    followers: { total: followersTotal },
    totalViews: resolvedTotalViews,
    popularity,
    genres: genres.length > 0 ? genres : [ministryType],
    discography,
    suggestedArtists,
    highlightedSongs,
    songs
  };
}

function hasArtistShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.name === 'string';
}

function extractArtistPayload(payload: unknown): Record<string, unknown> | null {
  if (hasArtistShape(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { artist?: unknown };
  return hasArtistShape(envelope.artist) ? envelope.artist : null;
}

async function getArtistDetailFromFunctions(artistId: string): Promise<ArtistDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  const cacheKey = getArtistDetailCacheKey(artistId);
  const cached = readClientCache<ArtistDetail>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const headers = await buildArtistHeaders({ 'Cache-Control': 'no-store' });
    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(artistId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const raw = extractArtistPayload(payload);
    if (!raw) {
      return null;
    }

    const normalized = normalizeArtistDetail(raw);
    writeClientCache(cacheKey, normalized, ARTIST_DETAIL_CACHE_TTL_MS);
    return normalized;
  } catch {
    return null;
  }
}

export async function getArtistDetailById(artistId: string): Promise<ArtistDetail | null> {
  const remote = await getArtistDetailFromFunctions(artistId);
  if (remote) {
    return remote;
  }

  return artistMockById[artistId] ?? null;
}

interface ArtistRouteLookupInput {
  artistId?: string;
  artistSlug?: string;
}

export async function getArtistDetailByRouteLookup({ artistId, artistSlug }: ArtistRouteLookupInput): Promise<ArtistDetail | null> {
  const normalizedArtistId = typeof artistId === 'string' ? artistId.trim() : '';
  const normalizedSlug = typeof artistSlug === 'string' ? artistSlug.trim() : '';
  const isNumericArtistId = /^[1-9]\d*$/.test(normalizedArtistId);

  const orderedCandidates = Array.from(new Set(
    [
      isNumericArtistId ? normalizedArtistId : '',
      normalizedSlug,
      normalizedArtistId
    ].filter((value) => value.length > 0)
  ));

  const scoreDetail = (detail: ArtistDetail): number => {
    const songsScore = Math.max(detail.songs.length, 0) * 100_000;
    const viewsScore = Math.max(Number(detail.totalViews) || 0, 0) * 10;
    const likesScore = Math.max(Number(detail.likeCount) || 0, 0);
    return songsScore + viewsScore + likesScore;
  };

  let bestMatch: ArtistDetail | null = null;
  let bestScore = -1;
  let namedMatch: ArtistDetail | null = null;

  for (const candidate of orderedCandidates) {
    const detail = await getArtistDetailById(candidate);
    if (!detail) {
      continue;
    }

    const score = scoreDetail(detail);
    if (!bestMatch || score > bestScore) {
      bestMatch = detail;
      bestScore = score;
    }

    if (hasMeaningfulArtistName(detail.name)) {
      namedMatch = detail;
    }

    if (detail.songs.length > 0 && detail.totalViews > 0) {
      return detail;
    }
  }

  if (bestMatch && !hasMeaningfulArtistName(bestMatch.name) && namedMatch && hasMeaningfulArtistName(namedMatch.name)) {
    return {
      ...bestMatch,
      name: namedMatch.name
    };
  }

  return bestMatch;
}

export async function requestTrackArtistProfileView(artistId: string): Promise<boolean> {
  const normalizedArtistId = artistId.trim();
  if (!functionsBaseUrl || !normalizedArtistId) {
    return false;
  }

  try {
    const headers = await buildArtistHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });
    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(normalizedArtistId)}/listen`, {
      method: 'POST',
      headers,
      cache: 'no-store'
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface ArtistFavoriteState {
  isFavorite: boolean;
  likeCount: number;
}

function readLocalArtistFavorite(artistId: string): ArtistFavoriteState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getArtistFavoriteStorageKey(artistId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ArtistFavoriteState>;
    if (typeof parsed.isFavorite !== 'boolean') {
      return null;
    }
    return {
      isFavorite: parsed.isFavorite,
      likeCount: Number.isFinite(Number(parsed.likeCount)) ? Number(parsed.likeCount) : 0
    };
  } catch {
    return null;
  }
}

function saveLocalArtistFavorite(artistId: string, state: ArtistFavoriteState): ArtistFavoriteState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(getArtistFavoriteStorageKey(artistId), JSON.stringify(state));
    } catch {
      // no-op
    }
  }
  return state;
}

export async function loadArtistFavoriteState(artistId: string): Promise<ArtistFavoriteState | null> {
  const normalizedArtistId = artistId.trim();
  if (!normalizedArtistId) {
    return null;
  }

  const local = readLocalArtistFavorite(normalizedArtistId);

  if (!functionsBaseUrl) {
    return local;
  }

  try {
    const headers = await buildArtistHeaders({ Accept: 'application/json' });
    if (!headers.Authorization) {
      return local;
    }

    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(normalizedArtistId)}/favorite`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return local;
    }

    const payload = (await response.json()) as { isFavorite?: boolean; likeCount?: number };
    if (typeof payload.isFavorite !== 'boolean') {
      return local;
    }

    return saveLocalArtistFavorite(normalizedArtistId, {
      isFavorite: payload.isFavorite,
      likeCount: Number.isFinite(Number(payload.likeCount)) ? Number(payload.likeCount) : 0
    });
  } catch {
    return local;
  }
}

export async function saveArtistFavoriteState(artistId: string, isFavorite: boolean): Promise<ArtistFavoriteState | null> {
  const normalizedArtistId = artistId.trim();
  if (!normalizedArtistId) {
    return null;
  }

  if (!functionsBaseUrl) {
    const local = readLocalArtistFavorite(normalizedArtistId) ?? { isFavorite: false, likeCount: 0 };
    const nextLikeCount = Math.max(local.likeCount + (isFavorite ? 1 : -1), 0);
    return saveLocalArtistFavorite(normalizedArtistId, { isFavorite, likeCount: nextLikeCount });
  }

  try {
    const headers = await buildArtistHeaders({ Accept: 'application/json' });
    if (!headers.Authorization) {
      return null;
    }

    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(normalizedArtistId)}/favorite`, {
      method: isFavorite ? 'PUT' : 'DELETE',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { isFavorite?: boolean; likeCount?: number };
    const nextState: ArtistFavoriteState = {
      isFavorite: typeof payload.isFavorite === 'boolean' ? payload.isFavorite : isFavorite,
      likeCount: Number.isFinite(Number(payload.likeCount)) ? Number(payload.likeCount) : 0
    };

    return saveLocalArtistFavorite(normalizedArtistId, nextState);
  } catch {
    return null;
  }
}

/** Lightweight row returned by GET /artists/:id/songs. */
export interface ArtistSongLookup {
  sqlSongId: number;
  songId: string | null;
  title: string;
  year: number | null;
  liturgicalUse: string | null;
  status: string | null;
  reviewStatus: 'reviewed' | 'pending';
  ownerFirebaseUid: string | null;
}

/**
 * Lists the songs of an artist (resolved from Cloud SQL by numeric artist id),
 * enriched with their Firestore document IDs. Used when adding a version to an
 * existing song from the create-song workspace.
 */
export async function fetchSongsByArtist(artistId: string | number): Promise<ArtistSongLookup[]> {
  if (!functionsBaseUrl) {
    return [];
  }
  const id = String(artistId).trim();
  if (!id) {
    return [];
  }

  try {
    const headers = await buildArtistHeaders({ 'Cache-Control': 'no-store' });
    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(id)}/songs`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as { items?: unknown };
    if (!Array.isArray(payload.items)) {
      return [];
    }
    return payload.items
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((row): ArtistSongLookup => ({
        sqlSongId: Number(row.sqlSongId),
        songId: typeof row.songId === 'string' && row.songId ? row.songId : null,
        title: String(row.title ?? ''),
        year: typeof row.year === 'number' ? row.year : null,
        liturgicalUse: typeof row.liturgicalUse === 'string' ? row.liturgicalUse : null,
        status: typeof row.status === 'string' ? row.status : null,
        reviewStatus: row.reviewStatus === 'reviewed' ? 'reviewed' : 'pending',
        ownerFirebaseUid: typeof row.ownerFirebaseUid === 'string' ? row.ownerFirebaseUid : null
      }))
      .filter((row) => Number.isFinite(row.sqlSongId) && row.sqlSongId > 0);
  } catch {
    return [];
  }
}

export async function getPublicrepertoiresForArtist(artistSongIds: string[]): Promise<ArtistrepertoireRef[]> {
  if (!artistSongIds.length) {
    return [];
  }

  if (functionsBaseUrl) {
    try {
      const response = await fetch(`${functionsBaseUrl}/repertoires?public=true`, {
        method: 'GET',
        cache: 'no-store'
      });

      if (response.ok) {
        const payload = (await response.json()) as { repertoires?: ArtistrepertoireRef[] };
        if (Array.isArray(payload.repertoires)) {
          return payload.repertoires.filter((repertoire) =>
            repertoire.songIds.some((songId) => artistSongIds.includes(songId))
          );
        }
      }
    } catch {
      /* fall through to mock */
    }
  }

  const songIdSet = new Set(artistSongIds);
  return artistrepertoiresMock.filter((repertoire) =>
    repertoire.songIds.some((songId) => songIdSet.has(songId))
  );
}

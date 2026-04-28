import { artistMockById, artistrepertoiresMock } from './mockData';
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

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

function normalizeSongRow(raw: Record<string, unknown>): ArtistSongRow {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' && raw.thumbnailUrl ? raw.thumbnailUrl : undefined,
    views: Number(raw.views ?? 0),
    tone: String(raw.tone ?? ''),
    hasLyrics: Boolean(raw.hasLyrics),
    hasSheet: Boolean(raw.hasSheet),
    isVerified: Boolean(raw.isVerified)
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
    albumId: typeof raw.albumId === 'string' && raw.albumId ? raw.albumId : undefined
  };
}

function normalizeSuggestedArtist(raw: Record<string, unknown>, index: number): SuggestedArtistItem {
  const images = normalizeImages(raw);
  return {
    id: String(raw.id ?? `suggested-${index}`),
    name: String(raw.name ?? 'Artista sugerido'),
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
    name: String(raw.name ?? ''),
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

  try {
    const response = await fetch(`${functionsBaseUrl}/artists/${artistId}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const raw = extractArtistPayload(payload);
    return raw ? normalizeArtistDetail(raw) : null;
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

/** Lightweight row returned by GET /artists/:id/songs. */
export interface ArtistSongLookup {
  sqlSongId: number;
  songId: string | null;
  title: string;
  year: number | null;
  liturgicalUse: string | null;
  status: string | null;
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
    const response = await fetch(`${functionsBaseUrl}/artists/${encodeURIComponent(id)}/songs`, {
      method: 'GET',
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
      .map((row) => ({
        sqlSongId: Number(row.sqlSongId),
        songId: typeof row.songId === 'string' && row.songId ? row.songId : null,
        title: String(row.title ?? ''),
        year: typeof row.year === 'number' ? row.year : null,
        liturgicalUse: typeof row.liturgicalUse === 'string' ? row.liturgicalUse : null,
        status: typeof row.status === 'string' ? row.status : null,
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

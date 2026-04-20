import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import { getPathSegments, handlePreflight, sendError, sendJson } from '../../shared/http/http';

interface ArtistSongRow {
  id: string;
  title: string;
  thumbnailUrl?: string;
  views: number;
  tone: string;
  hasLyrics: boolean;
  hasSheet: boolean;
  isVerified?: boolean;
}

interface ArtistDiscographyItem {
  id: string;
  title: string;
  year: number;
  coverUrl?: string;
  songId?: string;
  albumId?: string;
}

interface SuggestedArtistItem {
  id: string;
  name: string;
  imageUrl?: string;
  images?: ArtistImage[];
}

interface ArtistImage {
  url: string;
  width?: number;
  height?: number;
}

/**
 * Derives a 0-100 popularity score from raw totalViews using a log scale,
 * so new and consolidated artists can be compared on a bounded axis.
 */
function computePopularity(totalViews: number): number {
  if (!Number.isFinite(totalViews) || totalViews <= 0) {
    return 0;
  }
  const score = Math.round(Math.log10(totalViews + 1) * 20);
  return Math.max(0, Math.min(100, score));
}

/**
 * Normalizes the `images` array from a Firestore artist document.
 * Accepts either an `images[]` field with {url,width,height} entries,
 * or falls back to a single `imageUrl` string.
 */
function normalizeImages(artistData: Record<string, unknown>): ArtistImage[] {
  const raw = artistData.images;
  if (Array.isArray(raw)) {
    const normalized = raw
      .map((item): ArtistImage | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const entry = item as Record<string, unknown>;
        const url = typeof entry.url === 'string' ? entry.url : '';
        if (!url) {
          return null;
        }
        const width = Number(entry.width);
        const height = Number(entry.height);
        return {
          url,
          width: Number.isFinite(width) && width > 0 ? width : undefined,
          height: Number.isFinite(height) && height > 0 ? height : undefined
        };
      })
      .filter((value): value is ArtistImage => value !== null);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  const fallback = typeof artistData.imageUrl === 'string' && artistData.imageUrl ? artistData.imageUrl : '';
  return fallback ? [{ url: fallback }] : [];
}

function buildSongRow(docId: string, data: Record<string, unknown>): ArtistSongRow {
  return {
    id: docId,
    title: String(data.title ?? ''),
    thumbnailUrl: typeof data.thumbnailUrl === 'string' && data.thumbnailUrl ? data.thumbnailUrl : undefined,
    views: Number(data.views ?? data.viewCount ?? 0),
    tone: String(data.tone ?? data.defaultTone ?? ''),
    hasLyrics: Boolean(data.hasLyrics ?? (typeof data.lyrics === 'string' && (data.lyrics as string).length > 0)),
    hasSheet: Boolean(data.hasSheet ?? (typeof data.sheetUrl === 'string' && (data.sheetUrl as string).length > 0)),
    isVerified: Boolean(data.isVerified)
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

async function resolveSuggestedArtists(
  db: FirebaseFirestore.Firestore,
  artistData: Record<string, unknown>
): Promise<SuggestedArtistItem[]> {
  const suggestedIds = Array.isArray(artistData.suggestedArtistIds)
    ? (artistData.suggestedArtistIds as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (suggestedIds.length === 0) {
    const rawSuggestions = Array.isArray(artistData.suggestedArtists)
      ? (artistData.suggestedArtists as unknown[])
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      : [];

    return rawSuggestions.map((item, index) => ({
      id: String(item.id ?? `suggested-${index}`),
      name: String(item.name ?? 'Artista sugerido'),
      imageUrl: typeof item.imageUrl === 'string' && item.imageUrl ? item.imageUrl : undefined
    }));
  }

  const suggestions: Array<SuggestedArtistItem | null> = await Promise.all(
    suggestedIds.map(async (id) => {
      const snap = await db.collection('artists').doc(id).get();
      if (!snap.exists) {
        return null;
      }

      const data = (snap.data() ?? {}) as Record<string, unknown>;
      return {
        id: snap.id,
        name: String(data.name ?? 'Artista sugerido'),
        imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined
      } satisfies SuggestedArtistItem;
    })
  );

  return suggestions.filter((item): item is SuggestedArtistItem => item !== null);
}

export const artists = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const segments = getPathSegments(req);

  if (segments.length < 1 || segments.length > 2) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const artistId = segments[0];
  const subpath = segments[1];
  const db = getFirestore();

  // Sub-endpoints: keep the base artist response lean and cacheable.
  if (subpath) {
    return handleArtistSubEndpoint(artistId, subpath, db, res);
  }

  const [artistSnap, songsSnap] = await Promise.all([
    db.collection('artists').doc(artistId).get(),
    db.collection('songs')
      .where('artistId', '==', artistId)
      .where('status', '==', 'PUBLISHED')
      .orderBy('views', 'desc')
      .limit(20)
      .get()
  ]);

  if (!artistSnap.exists) {
    sendError(res, 404, 'not_found', 'Artist not found.');
    return;
  }

  const artistData = (artistSnap.data() ?? {}) as Record<string, unknown>;

  const songs: ArtistSongRow[] = songsSnap.docs.map((doc) =>
    buildSongRow(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
  );

  const totalViewsFromSongs = songs.reduce((acc, song) => acc + song.views, 0);
  const totalViewsRaw = Number(artistData.totalViews ?? totalViewsFromSongs);
  const totalViews = Number.isFinite(totalViewsRaw) ? totalViewsRaw : totalViewsFromSongs;

  const likesRaw = Number(artistData.likeCount ?? artistData.likes ?? 0);
  let likeCount = Number.isFinite(likesRaw) ? likesRaw : 0;

  if (likeCount === 0) {
    try {
      const likesSnap = await db.collection('artistLikes').where('artistId', '==', artistId).count().get();
      likeCount = likesSnap.data().count;
    } catch {
      likeCount = 0;
    }
  }

  const genres = Array.isArray(artistData.genres)
    ? (artistData.genres as unknown[])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    : [];

  const discography: ArtistDiscographyItem[] = Array.isArray(artistData.discography)
    ? (artistData.discography as unknown[])
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map(normalizeDiscographyItem)
    : songs.slice(0, 5).map((song, index) => ({
        id: `discography-${song.id}`,
        title: song.title,
        year: new Date().getFullYear() - (index + 3),
        coverUrl: song.thumbnailUrl,
        songId: song.id
      }));

  const suggestedArtists = await resolveSuggestedArtists(db, artistData);

  const highlightedSongs = songs.slice(0, 6).map((s) => s.id);

  const ministryType = String(artistData.ministryType ?? artistData.type ?? 'General');
  const images = normalizeImages(artistData);
  const imageUrl = images[0]?.url;
  const popularityRaw = Number(artistData.popularity);
  const popularity = Number.isFinite(popularityRaw) && popularityRaw >= 0
    ? Math.max(0, Math.min(100, Math.round(popularityRaw)))
    : computePopularity(totalViews);

  sendJson(res, 200, {
    type: 'artist',
    id: artistSnap.id,
    name: String(artistData.name ?? ''),
    bio: String(artistData.bio ?? ''),
    ministryType,
    images,
    imageUrl,
    songsCount: Number(artistData.songsCount ?? songs.length),
    followers: { total: likeCount },
    likeCount,
    totalViews,
    popularity,
    genres: genres.length > 0 ? genres : [ministryType],
    discography,
    suggestedArtists,
    highlightedSongs,
    songs
  });
});

/**
 * Resolves the sub-endpoints (`/top-songs`, `/discography`, `/related`).
 * Mirrors the slicing done by the base endpoint but returns only the
 * relevant collection, so clients can paginate/cache independently.
 */
async function handleArtistSubEndpoint(
  artistId: string,
  subpath: string,
  db: FirebaseFirestore.Firestore,
  res: functions.Response
): Promise<void> {
  const artistSnap = await db.collection('artists').doc(artistId).get();
  if (!artistSnap.exists) {
    sendError(res, 404, 'not_found', 'Artist not found.');
    return;
  }

  const artistData = (artistSnap.data() ?? {}) as Record<string, unknown>;

  if (subpath === 'top-songs') {
    const songsSnap = await db.collection('songs')
      .where('artistId', '==', artistId)
      .where('status', '==', 'PUBLISHED')
      .orderBy('views', 'desc')
      .limit(20)
      .get();
    const songs = songsSnap.docs.map((doc) => buildSongRow(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
    sendJson(res, 200, { items: songs });
    return;
  }

  if (subpath === 'discography') {
    const discography: ArtistDiscographyItem[] = Array.isArray(artistData.discography)
      ? (artistData.discography as unknown[])
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
          .map(normalizeDiscographyItem)
      : [];
    sendJson(res, 200, { items: discography });
    return;
  }

  if (subpath === 'related') {
    const suggested = await resolveSuggestedArtists(db, artistData);
    sendJson(res, 200, { items: suggested });
    return;
  }

  sendError(res, 404, 'not_found', 'Endpoint not found.');
}

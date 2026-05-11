import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { getBodyRecord, getOptionalAuthContext, getPathSegments, handlePreflight, sendError, sendJson } from '../../shared/http/http';
import { createArtist, findArtistByNameSlug, getArtistById, getArtistProfileBundle, searchArtists } from '../../shared/cloudSql/artists';
import { listSongsByArtistId } from '../../shared/cloudSql/songs';

interface ArtistSongRow {
  id: string;
  title: string;
  thumbnailUrl?: string;
  views: number;
  tone: string;
  hasLyrics: boolean;
  hasSheet: boolean;
  isVerified?: boolean;
  moderationState?: string;
  reviewStatus?: 'reviewed' | 'pending';
}

interface ArtistDiscographyItem {
  id: string;
  title: string;
  year: number;
  coverUrl?: string;
  songId?: string;
  albumId?: string;
  moderationState?: string;
  reviewStatus?: 'reviewed' | 'pending';
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

  const segments = getPathSegments(req);

  // ── GET /artists?q=  →  autocomplete search from Cloud SQL ──
  if (!segments.length && req.method === 'GET') {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      sendJson(res, 200, { items: [] });
      return;
    }
    try {
      const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : 10;
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 10;
      const rows = await searchArtists(query, limit);
      sendJson(res, 200, { items: rows });
    } catch (error) {
      console.error('Artist search failed:', error);
      sendError(res, 500, 'internal_error', 'Artist search failed.');
    }
    return;
  }

  // ── POST /artists  →  create new artist (type = 'unknown') ──
  if (!segments.length && req.method === 'POST') {
    const authContext = await getOptionalAuthContext(req);
    if (!authContext) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }
    const body = getBodyRecord(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      sendError(res, 400, 'invalid_argument', 'name is required.');
      return;
    }
    try {
      const artist = await createArtist(name, 'unknown');
      sendJson(res, 201, { ok: true, artist });
    } catch (error) {
      console.error('Artist creation failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to create artist.');
    }
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  if (segments.length < 1 || segments.length > 2) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const artistId = segments[0];
  const subpath = segments[1];
  const db = getAppFirestore();
  const authContext = await getOptionalAuthContext(req);
  const viewerFirebaseUid = authContext?.uid ?? null;

  // Sub-endpoints: keep the base artist response lean and cacheable.
  if (subpath) {
    return handleArtistSubEndpoint(artistId, subpath, db, res, viewerFirebaseUid);
  }

  try {
    const sqlProfile = await getArtistProfileBundle(artistId, viewerFirebaseUid);
    if (sqlProfile) {
      const songsCount = Number.isFinite(Number(sqlProfile.artist.songsCount))
        ? Math.max(Number(sqlProfile.artist.songsCount), sqlProfile.songs.length)
        : sqlProfile.songs.length;

      const totalViews = Number.isFinite(Number(sqlProfile.artist.totalViews))
        ? Number(sqlProfile.artist.totalViews)
        : sqlProfile.songs.reduce((acc, song) => acc + song.views, 0);

      const likeCount = Number.isFinite(Number(sqlProfile.artist.likeCount))
        ? Number(sqlProfile.artist.likeCount)
        : 0;

      const popularity = Number.isFinite(Number(sqlProfile.artist.popularity))
        ? Math.max(0, Math.min(100, Math.round(Number(sqlProfile.artist.popularity))))
        : computePopularity(totalViews);

      const ministryType = sqlProfile.artist.type || 'General';
      const genres = Array.isArray(sqlProfile.artist.genres) && sqlProfile.artist.genres.length > 0
        ? sqlProfile.artist.genres
        : [ministryType];

      sendJson(res, 200, {
        type: 'artist',
        id: String(sqlProfile.artist.id),
        name: sqlProfile.artist.name,
        bio: sqlProfile.artist.bio ?? '',
        ministryType,
        images: sqlProfile.artist.images ?? [],
        imageUrl: sqlProfile.artist.imageUrl ?? undefined,
        songsCount,
        followers: { total: likeCount },
        likeCount,
        totalViews,
        popularity,
        genres,
        discography: sqlProfile.discography,
        suggestedArtists: sqlProfile.suggestedArtists,
        highlightedSongs: sqlProfile.highlightedSongIds,
        songs: sqlProfile.songs
      });
      return;
    }
  } catch (error) {
    console.error('Cloud SQL artist bundle lookup failed:', error);
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
    const numericArtistId = Number.parseInt(artistId, 10);
    const isNumericId = Number.isFinite(numericArtistId) && numericArtistId > 0 && String(numericArtistId) === artistId;
    try {
      const sqlArtist = isNumericId
        ? await getArtistById(numericArtistId)
        : await findArtistByNameSlug(decodeURIComponent(artistId));
      if (sqlArtist) {
        sendJson(res, 200, {
          type: 'artist',
          id: String(sqlArtist.id),
          name: sqlArtist.name,
          bio: '',
          ministryType: sqlArtist.type || 'General',
          images: sqlArtist.imageUrl ? [{ url: sqlArtist.imageUrl }] : [],
          imageUrl: sqlArtist.imageUrl ?? undefined,
          songsCount: 0,
          followers: { total: 0 },
          likeCount: 0,
          totalViews: 0,
          popularity: 0,
          genres: [sqlArtist.type || 'General'],
          discography: [],
          suggestedArtists: [],
          highlightedSongs: [],
          songs: []
        });
        return;
      }
    } catch (error) {
      console.error('Cloud SQL artist fallback failed:', error);
    }

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
  res: functions.Response,
  viewerFirebaseUid: string | null
): Promise<void> {
  // ── /songs sub-endpoint resolves from Cloud SQL by numeric artist id ──
  // (allows listing songs for adding versions, regardless of Firestore artist doc).
  if (subpath === 'songs') {
    const numericArtistId = Number.parseInt(artistId, 10);
    if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
      sendError(res, 400, 'invalid_argument', 'Numeric artistId required.');
      return;
    }
    try {
      const sqlRows = await listSongsByArtistId(numericArtistId, 100, viewerFirebaseUid);
      // Enrich with Firestore song IDs (lookup by sqlSongId).
      const enriched = await Promise.all(sqlRows.map(async (row) => {
        let firestoreId: string | null = null;
        try {
          const snap = await db.collection('songs').where('sqlSongId', '==', row.id).limit(1).get();
          if (!snap.empty) {
            firestoreId = snap.docs[0].id;
          }
        } catch { /* best-effort */ }
        return {
          sqlSongId: row.id,
          songId: firestoreId,
          title: row.title,
          year: row.year,
          liturgicalUse: row.liturgicalUse,
          status: row.status,
          reviewStatus: row.reviewStatus,
          ownerFirebaseUid: row.ownerFirebaseUid
        };
      }));
      sendJson(res, 200, { items: enriched });
    } catch (error) {
      console.error('Artist songs lookup failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to list artist songs.');
    }
    return;
  }

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

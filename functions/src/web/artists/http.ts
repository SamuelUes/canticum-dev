import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { getClientIp, getBodyRecord, getOptionalAuthContext, getPathSegments, handlePreflight, sendError, sendJson } from '../../shared/http/http';
import { applyRateLimitHeaders, checkRateLimit } from '../../shared/rateLimit';
import {
  createArtist,
  findArtistByNameSlug,
  getArtistById,
  getArtistLikeState,
  listArtistAlbumsByArtistId,
  getArtistProfileBundle,
  incrementArtistViewInCloudSql,
  removeArtistLike,
  searchArtists,
  setArtistLike
} from '../../shared/cloudSql/artists';
import { listSongVersionsByArtistId } from '../../shared/cloudSql/songs';
import { capitalizeFirstLetter } from '../../shared/validation';

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

interface FeaturedArtistTrendItem {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
  rankDelta: number | null;
  score: number;
}

interface FeaturedArtistSnapshotDoc {
  artistId: number;
  rankPosition: number;
  name: string;
  imageUrl?: string;
  score?: number;
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

function resolveArtistName(raw: Record<string, unknown>, fallback: string): string {
  const candidates = [raw.name, raw.artistName, raw.displayName, raw.stageName]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return candidates[0] ?? fallback;
}

async function readFeaturedArtistSnapshot(
  db: FirebaseFirestore.Firestore,
  snapshotName: 'current' | 'past'
): Promise<Map<string, FeaturedArtistSnapshotDoc>> {
  const snap = await db.collection('featuredArtistsMeta').doc(snapshotName).collection('artists').get();
  const map = new Map<string, FeaturedArtistSnapshotDoc>();

  snap.docs.forEach((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const artistId = String(data.artistId ?? doc.id);
    map.set(artistId, {
      artistId: Number(data.artistId ?? doc.id),
      rankPosition: Number(data.rankPosition ?? 0),
      name: String(data.name ?? ''),
      imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
      score: Number.isFinite(Number(data.score)) ? Number(data.score) : undefined
    });
  });

  return map;
}

async function getFeaturedArtistTrends(db: FirebaseFirestore.Firestore): Promise<FeaturedArtistTrendItem[]> {
  const [currentArtists, pastArtists] = await Promise.all([
    readFeaturedArtistSnapshot(db, 'current'),
    readFeaturedArtistSnapshot(db, 'past')
  ]);

  const trends: FeaturedArtistTrendItem[] = [];
  currentArtists.forEach((current, artistId) => {
    const past = pastArtists.get(artistId);
    trends.push({
      id: String(current.artistId),
      title: current.name || 'Artista',
      subtitle: 'General',
      avatarUrl: current.imageUrl,
      rankDelta: past ? past.rankPosition - current.rankPosition : null,
      score: current.score ?? 0
    });
  });

  return trends.sort((a, b) => b.score - a.score).slice(0, 6);
}

function buildSongRow(docId: string, data: Record<string, unknown>): ArtistSongRow {
  return {
    id: docId,
    title: String(data.title ?? ''),
    thumbnailUrl: typeof data.thumbnailUrl === 'string' && data.thumbnailUrl ? data.thumbnailUrl : undefined,
    views: Number(data.views ?? data.viewCount ?? data.totalViews ?? 0),
    tone: String(data.tone ?? data.defaultTone ?? ''),
    hasLyrics: Boolean(data.hasLyrics ?? (typeof data.lyrics === 'string' && (data.lyrics as string).length > 0)),
    hasSheet: Boolean(data.hasSheet ?? (typeof data.sheetUrl === 'string' && (data.sheetUrl as string).length > 0)),
    isVerified: Boolean(data.isVerified),
    moderationState: typeof data.status === 'string' ? data.status : undefined
  };
}

function resolveSongOwnerUid(data: Record<string, unknown>): string {
  if (typeof data.ownerUserId === 'string' && data.ownerUserId.trim().length > 0) {
    return data.ownerUserId.trim();
  }
  if (typeof data.createdBy === 'string' && data.createdBy.trim().length > 0) {
    return data.createdBy.trim();
  }
  return '';
}

function isSongVisibleForViewer(data: Record<string, unknown>, viewerFirebaseUid: string | null): boolean {
  const status = typeof data.status === 'string' ? data.status.trim().toUpperCase() : '';
  if (status === 'APPROVED' || status === 'PUBLISHED') {
    return true;
  }
  if (status === 'DRAFT' && viewerFirebaseUid) {
    return resolveSongOwnerUid(data) === viewerFirebaseUid;
  }
  return false;
}

async function listVisibleFirestoreSongsByArtist(
  db: FirebaseFirestore.Firestore,
  artistId: string,
  viewerFirebaseUid: string | null,
  limit: number
): Promise<ArtistSongRow[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 20;
  const songsSnap = await db.collection('songs')
    .where('artistId', '==', artistId)
    .limit(Math.max(safeLimit * 5, safeLimit))
    .get();

  return songsSnap.docs
    .map((doc) => ({ id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }))
    .filter((entry) => isSongVisibleForViewer(entry.data, viewerFirebaseUid))
    .map((entry) => buildSongRow(entry.id, entry.data))
    .sort((a, b) => b.views - a.views)
    .slice(0, safeLimit);
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
      name: resolveArtistName(item, 'Artista sugerido'),
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
        name: resolveArtistName(data, 'Artista sugerido'),
        imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined
      } satisfies SuggestedArtistItem;
    })
  );

  return suggestions.filter((item): item is SuggestedArtistItem => item !== null);
}

async function resolveNumericArtistId(artistLookup: string): Promise<number | null> {
  const normalized = artistLookup.trim();
  if (!normalized) {
    return null;
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric > 0 && String(numeric) === normalized) {
    return numeric;
  }

  const artist = await findArtistByNameSlug(decodeURIComponent(normalized));
  return artist?.id ?? null;
}

export const artists = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);

  if (segments.length === 1 && segments[0] === 'featured-trends' && req.method === 'GET') {
    try {
      const db = getAppFirestore();
      const items = await getFeaturedArtistTrends(db);
      sendJson(res, 200, { items });
    } catch (error) {
      console.error('Featured artist trends failed:', error);
      sendError(res, 500, 'internal_error', 'Featured artist trends failed.');
    }
    return;
  }

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
    const name = typeof body.name === 'string' ? capitalizeFirstLetter(body.name.trim()) : '';
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

  if (segments.length < 1 || segments.length > 2) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const artistId = segments[0];
  const subpath = segments[1];
  const db = getAppFirestore();
  const authContext = await getOptionalAuthContext(req);
  const viewerFirebaseUid = authContext?.uid ?? null;

  if (subpath === 'favorite') {
    if (!authContext?.uid) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const numericArtistId = await resolveNumericArtistId(artistId);
    if (!numericArtistId) {
      sendError(res, 404, 'not_found', 'Artist not found.');
      return;
    }

    try {
      if (req.method === 'GET') {
        const state = await getArtistLikeState(numericArtistId, authContext.uid);
        sendJson(res, 200, {
          artistId: String(numericArtistId),
          isFavorite: state.isLiked,
          likeCount: state.likeCount
        });
        return;
      }

      if (req.method === 'PUT') {
        const state = await setArtistLike(numericArtistId, authContext.uid);
        sendJson(res, 200, {
          ok: true,
          artistId: String(numericArtistId),
          isFavorite: state.isLiked,
          likeCount: state.likeCount
        });
        return;
      }

      if (req.method === 'DELETE') {
        const state = await removeArtistLike(numericArtistId, authContext.uid);
        sendJson(res, 200, {
          ok: true,
          artistId: String(numericArtistId),
          isFavorite: state.isLiked,
          likeCount: state.likeCount
        });
        return;
      }

      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('user mapping not found')) {
        sendError(res, 409, 'invalid_state', 'Authenticated user is not yet projected to Cloud SQL.');
        return;
      }
      console.error('Artist favorite operation failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to persist artist favorite.');
      return;
    }
  }

  if (subpath === 'listen') {
    if (req.method !== 'PUT') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }

    const authContext = await getOptionalAuthContext(req);
    const listenLimiterIdentifier = authContext?.uid ?? getClientIp(req) ?? `artist:${artistId}`;
    const listenLimiter = await checkRateLimit(`${listenLimiterIdentifier}:${artistId}`, 'artists_listen', 5, 300);
    applyRateLimitHeaders(res, 5, listenLimiter);
    if (!listenLimiter.allowed) {
      res.set('Retry-After', String(listenLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Listen limit reached. Retry in ${listenLimiter.retryAfterSeconds}s.`);
      return;
    }

    const numericArtistId = await resolveNumericArtistId(artistId);
    if (!numericArtistId) {
      sendError(res, 404, 'not_found', 'Artist not found.');
      return;
    }

    try {
      const metrics = await incrementArtistViewInCloudSql(numericArtistId);
      if (!metrics) {
        sendError(res, 404, 'not_found', 'Artist not found.');
        return;
      }

      try {
        await db.collection('artists').doc(String(numericArtistId)).set(
          {
            totalViews: metrics.totalViews,
            likeCount: metrics.likeCount,
            popularity: metrics.popularity
          },
          { merge: true }
        );
      } catch {
        // best-effort Firestore projection
      }

      sendJson(res, 200, {
        ok: true,
        artistId: String(metrics.artistId),
        totalViews: metrics.totalViews,
        likeCount: metrics.likeCount,
        popularity: metrics.popularity
      });
      return;
    } catch (error) {
      console.error('Artist listen tracking failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to register artist listen.');
      return;
    }
  }

  // Sub-endpoints: keep the base artist response lean and cacheable.
  if (subpath) {
    if (req.method !== 'GET') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }
    return handleArtistSubEndpoint(artistId, subpath, db, res, viewerFirebaseUid);
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
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
    // Continue to Firestore fallback
  }

  const artistSnap = await db.collection('artists').doc(artistId).get();

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
  const numericArtistId = Number.parseInt(artistId, 10);
  const isNumericArtistId = Number.isFinite(numericArtistId) && numericArtistId > 0 && String(numericArtistId) === artistId;

  let fallbackSqlArtist: Awaited<ReturnType<typeof getArtistById>> | null = null;

  try {
    fallbackSqlArtist = isNumericArtistId
      ? await getArtistById(numericArtistId)
      : await findArtistByNameSlug(decodeURIComponent(artistId));
  } catch {
    // keep Firestore fallback available even if SQL enrichment fails
  }

  const songs = await listVisibleFirestoreSongsByArtist(db, artistId, viewerFirebaseUid, 20);

  const totalViewsFromSongs = songs.reduce((acc, song) => acc + song.views, 0);
  const totalViewsRaw = Number(artistData.totalViews ?? fallbackSqlArtist?.totalViews ?? totalViewsFromSongs);
  const totalViews = Number.isFinite(totalViewsRaw) ? totalViewsRaw : totalViewsFromSongs;

  const likesRaw = Number(artistData.likeCount ?? artistData.likes ?? fallbackSqlArtist?.likeCount ?? 0);
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

  const firestoreDiscography: ArtistDiscographyItem[] = Array.isArray(artistData.discography)
    ? (artistData.discography as unknown[])
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map(normalizeDiscographyItem)
    : [];

  // If no discography in artist document, query albums collection directly
  if (firestoreDiscography.length === 0) {
    console.log('[artists] No discography in artist document, querying albums collection');
    try {
      const albumsSnap = await db.collection('albums')
        .where('artistId', '==', artistId)
        .where('status', '==', 'PUBLISHED')
        .limit(5)
        .get();

      console.log('[artists] Found', albumsSnap.size, 'albums for artist', artistId);
      firestoreDiscography.push(...albumsSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          title: String(data.title ?? data.name ?? ''),
          year: Number(data.releaseYear ?? new Date().getFullYear()),
          coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : undefined,
          moderationState: typeof data.status === 'string' ? data.status : undefined,
          reviewStatus: (data.status === 'PUBLISHED' || data.status === 'APPROVED') ? 'reviewed' : 'pending' as 'reviewed' | 'pending'
        };
      }));
    } catch (error) {
      console.error('[artists] Error querying albums collection:', error);
      // If query fails, fall back to songs
      firestoreDiscography.push(...songs.slice(0, 5).map((song, index) => ({
        id: `discography-${song.id}`,
        title: song.title,
        year: new Date().getFullYear() - (index + 3),
        coverUrl: song.thumbnailUrl,
        songId: song.id
      })));
    }
  }

  console.log('[artists] Final discography count:', firestoreDiscography.length);
  const discography = firestoreDiscography;

  const suggestedArtists = await resolveSuggestedArtists(db, artistData);

  const highlightedSongs = songs.slice(0, 6).map((s) => s.id);

  const ministryType = String(artistData.ministryType ?? artistData.type ?? fallbackSqlArtist?.type ?? 'General');
  const images = normalizeImages(artistData);
  const imageUrl = images[0]?.url ?? fallbackSqlArtist?.imageUrl ?? undefined;
  const popularityRaw = Number(artistData.popularity ?? fallbackSqlArtist?.popularity ?? computePopularity(totalViews));
  const popularity = Number.isFinite(popularityRaw) && popularityRaw >= 0
    ? Math.max(0, Math.min(100, Math.round(popularityRaw)))
    : computePopularity(totalViews);

  const resolvedName = resolveArtistName(
    {
      ...artistData,
      ...(fallbackSqlArtist?.name ? { name: fallbackSqlArtist.name } : {})
    },
    'Artista'
  );

  sendJson(res, 200, {
    type: 'artist',
    id: artistSnap.id,
    name: resolvedName,
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
      const sqlRows = await listSongVersionsByArtistId(numericArtistId, 100, viewerFirebaseUid);
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
          ownerFirebaseUid: row.ownerFirebaseUid,
          versions: row.versions ?? []
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
    const songs = await listVisibleFirestoreSongsByArtist(db, artistId, viewerFirebaseUid, 20);
    sendJson(res, 200, { items: songs });
    return;
  }

  if (subpath === 'discography') {
    try {
      const numericArtistId = await resolveNumericArtistId(artistId);
      if (numericArtistId) {
        const albums = await listArtistAlbumsByArtistId(numericArtistId);
        sendJson(res, 200, {
          items: albums.map((album) => ({
            id: album.id,
            title: album.title,
            year: album.year,
            coverUrl: album.coverUrl,
            albumId: album.albumId,
            moderationState: album.moderationState,
            reviewStatus: album.reviewStatus
          }))
        });
        return;
      }
    } catch {
      // fallback to Firestore if SQL lookup is unavailable
    }

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

import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { updateAlbumStatusInCloudSql } from '../../shared/cloudSql/artists';
import { createAlbumInCloudSql } from '../../shared/cloudSql/albums';
import { getSharedPool } from '../../shared/cloudSql/pool';
import { getBodyRecord, getOptionalAuthContext, getPathSegments, getQueryString, handlePreflight, sendError, sendJson } from '../../shared/http/http';

type AlbumType = 'album' | 'single' | 'ep' | 'compilation' | 'live';

interface AlbumImage { url: string; width?: number; height?: number; }
interface AlbumSimplifiedArtist {
  id: string;
  name: string;
  type: 'artist';
  href?: string;
  imageUrl?: string;
}
interface AlbumCopyright { text: string; type: 'C' | 'P'; }
interface AlbumExternalIds { upc?: string; }
interface AlbumExternalUrls { canticum?: string; spotify?: string; }

interface AlbumSongRow {
  id: string;
  type: 'song';
  title: string;
  name: string;
  thumbnailUrl?: string;
  trackNumber: number;
  discNumber: number;
  durationMs?: number;
  artists?: AlbumSimplifiedArtist[];
  externalUrls?: AlbumExternalUrls;
  tone: string;
  views: number;
  hasLyrics: boolean;
  hasSheet: boolean;
  isPrimaryRelease: boolean;
  isVerified?: boolean;
  status?: string;
}

interface AlbumTracksBucket {
  href: string;
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
  items: AlbumSongRow[];
}

interface AlbumDetail {
  id: string;
  type: 'album';
  title: string;
  name: string;
  description?: string;
  coverUrl?: string;
  images?: AlbumImage[];
  releaseYear: number;
  releaseDate?: string;
  releaseDatePrecision?: 'year' | 'month' | 'day';
  albumType: AlbumType;
  artistId: string;
  artistName: string;
  artistImageUrl?: string;
  artists?: AlbumSimplifiedArtist[];
  songsCount: number;
  totalTracks: number;
  tracks: AlbumTracksBucket;
  songs: AlbumSongRow[];
  label?: string;
  genres?: string[];
  copyrights?: AlbumCopyright[];
  externalIds?: AlbumExternalIds;
  externalUrls?: AlbumExternalUrls;
  popularity: number;
}

interface AlbumRef {
  id: string;
  type: 'album';
  title: string;
  name: string;
  coverUrl?: string;
  images?: AlbumImage[];
  releaseYear: number;
  releaseDate?: string;
  albumType: AlbumType;
  songsCount: number;
  totalTracks: number;
  artists?: AlbumSimplifiedArtist[];
}

function resolveAlbumType(raw: unknown): AlbumType {
  const valid: AlbumType[] = ['album', 'single', 'ep', 'compilation', 'live'];
  if (typeof raw === 'string' && valid.includes(raw as AlbumType)) {
    return raw as AlbumType;
  }
  return 'album';
}

function normalizeImages(raw: unknown, fallbackUrl?: string): AlbumImage[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw
      .map((entry): AlbumImage | null => {
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
      .filter((value): value is AlbumImage => value !== null);
    if (list.length > 0) return list;
  }
  return fallbackUrl ? [{ url: fallbackUrl }] : undefined;
}

function resolvePrecision(raw: unknown): 'year' | 'month' | 'day' | undefined {
  return raw === 'year' || raw === 'month' || raw === 'day' ? raw : undefined;
}

function computePopularity(raw: unknown, totalViews: number): number {
  const stored = Number(raw);
  if (Number.isFinite(stored) && stored >= 0) return Math.min(100, Math.round(stored));
  if (!Number.isFinite(totalViews) || totalViews <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.log10(totalViews + 1) * 20)));
}


function normalizeAlbumStatus(raw: unknown): string {
  const status = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return status || 'DRAFT';
}

function resolveAlbumOwnerUid(data: Record<string, unknown>): string {
  if (typeof data.ownerUserId === 'string' && data.ownerUserId.trim().length > 0) {
    return data.ownerUserId.trim();
  }
  if (typeof data.createdBy === 'string' && data.createdBy.trim().length > 0) {
    return data.createdBy.trim();
  }
  return '';
}

function canViewAlbum(data: Record<string, unknown>, viewerUid: string | null, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  const status = normalizeAlbumStatus(data.status);
  if (status === 'PUBLISHED' || status === 'APPROVED') {
    return true;
  }

  return Boolean(viewerUid && resolveAlbumOwnerUid(data) === viewerUid);
}

function deriveReleaseDate(data: Record<string, unknown>): { releaseDate?: string; precision?: 'year' | 'month' | 'day'; year: number } {
  const rd = typeof data.releaseDate === 'string' ? (data.releaseDate as string) : undefined;
  const precision = resolvePrecision(data.releaseDatePrecision);
  const year = Number(data.releaseYear ?? (rd ? Number(rd.slice(0, 4)) : new Date().getFullYear()));
  if (rd) return { releaseDate: rd, precision: precision ?? (rd.length >= 10 ? 'day' : rd.length >= 7 ? 'month' : 'year'), year };
  if (year) return { releaseDate: String(year), precision: precision ?? 'year', year };
  return { year };
}

function buildSongRow(docId: string, data: Record<string, unknown>, trackNumber: number, isPrimaryRelease: boolean): AlbumSongRow {
  const title = String(data.title ?? data.name ?? '');
  const rawArtists = Array.isArray(data.artists) ? (data.artists as Array<Record<string, unknown>>) : null;
  const artists: AlbumSimplifiedArtist[] | undefined = rawArtists && rawArtists.length > 0
    ? rawArtists.map((e) => ({
        id: String(e.id ?? ''),
        name: String(e.name ?? ''),
        type: 'artist' as const,
        href: typeof e.href === 'string' ? e.href : undefined
      }))
    : typeof data.artistName === 'string' && data.artistName
      ? [{
          id: typeof data.artistId === 'string' ? (data.artistId as string) : '',
          name: data.artistName as string,
          type: 'artist' as const
        }]
      : undefined;
  const durationMs = typeof data.durationMs === 'number'
    ? data.durationMs
    : typeof data.duration_ms === 'number' ? (data.duration_ms as number) : undefined;
  return {
    id: docId,
    type: 'song',
    title,
    name: title,
    thumbnailUrl: typeof data.thumbnailUrl === 'string' && data.thumbnailUrl ? data.thumbnailUrl : undefined,
    trackNumber,
    discNumber: typeof data.discNumber === 'number' ? (data.discNumber as number) : 1,
    durationMs,
    artists,
    externalUrls: { canticum: `/songs/${docId}` },
    tone: String(data.tone ?? data.defaultTone ?? ''),
    views: Number(data.views ?? data.viewCount ?? 0),
    hasLyrics: Boolean(data.hasLyrics ?? (typeof data.lyrics === 'string' && (data.lyrics as string).length > 0)),
    hasSheet: Boolean(data.hasSheet ?? (typeof data.sheetUrl === 'string' && (data.sheetUrl as string).length > 0)),
    isPrimaryRelease,
    isVerified: Boolean(data.isVerified),
    status: typeof data.status === 'string' ? data.status : undefined
  };
}

async function getAlbumById(db: FirebaseFirestore.Firestore, albumId: string, viewerUid: string | null, viewerRole?: string): Promise<AlbumDetail | null> {
  const albumSnap = await db.collection('albums').doc(albumId).get();

  if (!albumSnap.exists) {
    return null;
  }

  const albumData = (albumSnap.data() ?? {}) as Record<string, unknown>;

  if (!canViewAlbum(albumData, viewerUid, viewerRole)) {
    return null;
  }

  const artistId = String(albumData.artistId ?? '');
  let artistName = String(albumData.artistName ?? '');
  let artistImageUrl: string | undefined;

  if (artistId && !artistName) {
    try {
      const artistSnap = await db.collection('artists').doc(artistId).get();
      if (artistSnap.exists) {
        const ad = (artistSnap.data() ?? {}) as Record<string, unknown>;
        artistName = String(ad.name ?? '');
        artistImageUrl = typeof ad.imageUrl === 'string' ? ad.imageUrl : undefined;
      }
    } catch {
      /* fallback to empty */
    }
  }

  const songs: AlbumSongRow[] = [];

  // Get songs from songIds array in album document
  const songIds = Array.isArray(albumData.songIds) ? (albumData.songIds as string[]) : [];
  if (songIds.length > 0) {
    const songFetches = songIds.map(async (songId, index) => {
      const songSnap = await db.collection('songs').doc(songId).get();
      if (!songSnap.exists) return null;

      const sd = (songSnap.data() ?? {}) as Record<string, unknown>;
      console.log('[albums] Song data for', songId, 'has status:', typeof sd.status === 'string', 'status value:', sd.status);
      return buildSongRow(
        songSnap.id,
        sd,
        index + 1, // Use array index as track number
        true // Assume primary release
      );
    });

    const results = await Promise.all(songFetches);
    songs.push(...results.filter((s): s is AlbumSongRow => s !== null));
  }

  const title = String(albumData.title ?? albumData.name ?? '');
  const coverUrl = typeof albumData.coverUrl === 'string' && albumData.coverUrl ? albumData.coverUrl : undefined;
  const images = normalizeImages(albumData.images, coverUrl);
  const { releaseDate, precision, year } = deriveReleaseDate(albumData);
  const totalTracks = Number(albumData.songsCount ?? albumData.totalTracks ?? songs.length);
  const totalViews = songs.reduce((acc, s) => acc + (Number.isFinite(s.views) ? s.views : 0), 0);
  const popularity = computePopularity(albumData.popularity, Number(albumData.totalViews ?? totalViews));

  const primaryArtist: AlbumSimplifiedArtist | null = artistName
    ? { id: artistId, name: artistName, type: 'artist', href: artistId ? `/artists/${artistId}` : undefined, imageUrl: artistImageUrl }
    : null;

  const rawAlbumArtists = Array.isArray(albumData.artists) ? (albumData.artists as Array<Record<string, unknown>>) : null;
  const artists: AlbumSimplifiedArtist[] | undefined = rawAlbumArtists && rawAlbumArtists.length > 0
    ? rawAlbumArtists.map((e) => ({
        id: String(e.id ?? ''),
        name: String(e.name ?? ''),
        type: 'artist' as const,
        href: typeof e.href === 'string' ? e.href : undefined,
        imageUrl: typeof e.imageUrl === 'string' ? e.imageUrl : undefined
      }))
    : primaryArtist
      ? [primaryArtist]
      : undefined;

  const tracks: AlbumTracksBucket = {
    href: `/albums/${albumSnap.id}/tracks?offset=0&limit=${songs.length || 50}`,
    limit: songs.length,
    offset: 0,
    total: songs.length,
    next: null,
    previous: null,
    items: songs
  };

  const copyrights = Array.isArray(albumData.copyrights)
    ? (albumData.copyrights as Array<Record<string, unknown>>)
        .filter((c) => c && typeof c.text === 'string')
        .map((c) => ({ text: String(c.text), type: (c.type === 'C' || c.type === 'P' ? c.type : 'C') as 'C' | 'P' }))
    : undefined;

  const upc = typeof (albumData.externalIds as Record<string, unknown> | undefined)?.upc === 'string'
    ? ((albumData.externalIds as Record<string, string>).upc)
    : typeof albumData.upc === 'string' ? (albumData.upc as string) : undefined;

  return {
    id: albumSnap.id,
    type: 'album',
    title,
    name: title,
    description: typeof albumData.description === 'string' ? albumData.description : undefined,
    coverUrl: coverUrl ?? images?.[0]?.url,
    images,
    releaseYear: year,
    releaseDate,
    releaseDatePrecision: precision,
    albumType: resolveAlbumType(albumData.albumType),
    artistId,
    artistName,
    artistImageUrl,
    artists,
    songsCount: totalTracks,
    totalTracks,
    tracks,
    songs,
    label: typeof albumData.label === 'string' ? albumData.label : undefined,
    genres: Array.isArray(albumData.genres) ? (albumData.genres as unknown[]).filter((g): g is string => typeof g === 'string') : undefined,
    copyrights,
    externalIds: upc ? { upc } : undefined,
    externalUrls: { canticum: `/albums/${albumSnap.id}` },
    popularity
  };
}

async function getAlbumsByArtist(db: FirebaseFirestore.Firestore, artistId: string, viewerUid: string | null, viewerRole?: string): Promise<AlbumRef[]> {
  const isAdmin = viewerRole === 'admin';
  const baseQuery = db.collection('albums').where('artistId', '==', artistId);
  const snap = isAdmin
    ? await baseQuery.orderBy('releaseYear', 'desc').get()
    : await baseQuery.where('status', '==', 'PUBLISHED').orderBy('releaseYear', 'desc').get();

  return snap.docs
    .map((doc) => ({ doc, data: (doc.data() ?? {}) as Record<string, unknown> }))
    .filter((entry) => canViewAlbum(entry.data, viewerUid, viewerRole))
    .map(({ doc, data: d }) => {
    const title = String(d.title ?? d.name ?? '');
    const coverUrl = typeof d.coverUrl === 'string' && d.coverUrl ? d.coverUrl : undefined;
    const images = normalizeImages(d.images, coverUrl);
    const { releaseDate, year } = deriveReleaseDate(d);
    const totalTracks = Number(d.songsCount ?? d.totalTracks ?? 0);
    const dArtistId = String(d.artistId ?? artistId);
    const dArtistName = typeof d.artistName === 'string' ? (d.artistName as string) : '';
    const artists: AlbumSimplifiedArtist[] | undefined = dArtistName
      ? [{ id: dArtistId, name: dArtistName, type: 'artist', href: dArtistId ? `/artists/${dArtistId}` : undefined }]
      : undefined;
    return {
      id: doc.id,
      type: 'album' as const,
      title,
      name: title,
      coverUrl: coverUrl ?? images?.[0]?.url,
      images,
      releaseYear: year,
      releaseDate,
      albumType: resolveAlbumType(d.albumType),
      songsCount: totalTracks,
      totalTracks,
      artists
    };
  });
}

export const albums = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const auth = await getOptionalAuthContext(req);
  const viewerUid = auth?.uid ?? null;
  const viewerRole = typeof auth?.token.role === 'string' ? auth.token.role : undefined;

  const segments = getPathSegments(req);
  const db = getAppFirestore();

  // POST /albums - Create new album
  if (segments.length === 0 && req.method === 'POST') {
    if (!auth?.uid || (viewerRole !== 'admin' && viewerRole !== 'editor')) {
      sendError(res, 403, 'forbidden', 'Solo admin o editor pueden crear álbumes.');
      return;
    }

    const body = getBodyRecord(req);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const artistId = Number(body.artistId);
    const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
    const releaseYear = typeof body.releaseYear === 'number' ? body.releaseYear : undefined;
    const albumType = resolveAlbumType(body.albumType);
    const genre = typeof body.genre === 'string' ? body.genre.trim() : '';
    const coverUrl = typeof body.coverUrl === 'string' ? body.coverUrl.trim() : undefined;
    const tracks = Array.isArray(body.tracks) ? body.tracks as Array<Record<string, unknown>> : [];

    if (!title) {
      sendError(res, 400, 'bad_request', 'El título es requerido.');
      return;
    }

    if (!Number.isFinite(artistId) || artistId <= 0) {
      sendError(res, 400, 'bad_request', 'El ID del artista es requerido y debe ser un número válido.');
      return;
    }

    if (!artistName) {
      sendError(res, 400, 'bad_request', 'El nombre del artista es requerido.');
      return;
    }

    if (!genre) {
      sendError(res, 400, 'bad_request', 'El género es requerido.');
      return;
    }

    if (tracks.length === 0) {
      sendError(res, 400, 'bad_request', 'El álbum debe tener al menos una pista.');
      return;
    }

    const normalizedTracks = tracks
      .map((t) => ({
        songId: typeof t.songId === 'string' ? t.songId.trim() : '',
        songTitle: typeof t.songTitle === 'string' ? t.songTitle.trim() : '',
        trackNumber: Number(t.trackNumber ?? 0)
      }))
      .filter((t) => t.songId && Number.isFinite(t.trackNumber) && t.trackNumber > 0);

    if (normalizedTracks.length === 0) {
      sendError(res, 400, 'bad_request', 'Las pistas deben tener songId y trackNumber válidos.');
      return;
    }

    try {
      console.log('[albums] Creating album with artistId:', artistId, 'title:', title, 'tracks:', normalizedTracks.length);
      const result = await createAlbumInCloudSql({
        artistId,
        title,
        releaseYear,
        albumType,
        genre,
        coverUrl,
        upc: undefined,
        label: undefined,
        tracks: normalizedTracks
      });
      console.log('[albums] Album created in Cloud SQL with ID:', result.albumId);

      // Generate Firestore document ID
      const albumId = `album_${result.albumId}`;

      // Optionally project to Firestore
      console.log('[albums] Creating Firestore document:', albumId);
      const firestoreData: Record<string, unknown> = {
        id: albumId,
        sqlAlbumId: result.albumId,
        title,
        artistId: String(artistId),
        artistName,
        releaseYear: releaseYear || new Date().getFullYear(),
        albumType,
        genres: [genre],
        status: 'PUBLISHED',
        songsCount: normalizedTracks.length,
        totalTracks: normalizedTracks.length,
        songIds: normalizedTracks.map(t => t.songId),
        createdBy: auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Only add coverUrl if it's defined
      if (coverUrl) {
        firestoreData.coverUrl = coverUrl;
      }

      await db.collection('albums').doc(albumId).set(firestoreData);
      console.log('[albums] Firestore document created successfully');

      sendJson(res, 201, { albumId, sqlAlbumId: result.albumId });
    } catch (error) {
      console.error('[albums] Error creating album:', error);
      if (error instanceof Error) {
        console.error('[albums] Error message:', error.message);
        console.error('[albums] Error stack:', error.stack);
      }
      sendError(res, 500, 'internal_error', 'Error al crear el álbum en Cloud SQL.');
    }
    return;
  }

  // PATCH /albums/:id - Update album (e.g., cover URL)
  if (segments.length === 1 && req.method === 'PATCH') {
    if (!auth?.uid || (viewerRole !== 'admin' && viewerRole !== 'editor')) {
      sendError(res, 403, 'forbidden', 'Solo admin o editor pueden actualizar álbumes.');
      return;
    }

    const albumId = segments[0];
    const body = getBodyRecord(req);
    const coverUrl = typeof body.coverUrl === 'string' ? body.coverUrl.trim() : undefined;

    try {
      const pool = getSharedPool();
      
      if (coverUrl) {
        // Update cover_url and images_json in Cloud SQL
        const imagesJson = JSON.stringify([{ url: coverUrl, width: 1200, height: 1200 }]);
        await pool.query(
          'UPDATE albums SET cover_url = $1, images_json = $2 WHERE id = $3',
          [coverUrl, imagesJson, Number(albumId.replace('album_', ''))]
        );

        // Update coverUrl in Firestore
        await db.collection('albums').doc(albumId).update({
          coverUrl,
          images: [{ url: coverUrl, width: 1200, height: 1200 }],
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      sendJson(res, 200, { success: true });
    } catch (error) {
      console.error('[albums] Error updating album:', error);
      sendError(res, 500, 'internal_error', 'Error al actualizar el álbum.');
    }
    return;
  }

  if (segments.length === 2 && segments[1] === 'status' && req.method === 'PATCH') {
    if (!auth?.uid || viewerRole !== 'admin') {
      sendError(res, 403, 'forbidden', 'Only admin can change album status.');
      return;
    }

    const albumId = segments[0];
    const albumRef = db.collection('albums').doc(albumId);
    const albumSnap = await albumRef.get();

    if (!albumSnap.exists) {
      sendError(res, 404, 'not_found', 'Album not found.');
      return;
    }

    const body = getBodyRecord(req);
    const requestedStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
    const allowed = new Set(['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED']);

    if (!allowed.has(requestedStatus)) {
      sendError(res, 400, 'invalid_argument', 'status must be one of DRAFT, IN_REVIEW, REJECTED, APPROVED, PUBLISHED.');
      return;
    }

    const albumData = (albumSnap.data() ?? {}) as Record<string, unknown>;
    const sqlAlbumId = Number(albumData.sqlAlbumId ?? albumId);

    if (Number.isFinite(sqlAlbumId) && sqlAlbumId > 0) {
      try {
        await updateAlbumStatusInCloudSql(Math.floor(sqlAlbumId), requestedStatus);
      } catch (error) {
        console.error('[albums] Cloud SQL status update failed:', error);
        sendError(res, 500, 'internal_error', 'Failed to update album status in Cloud SQL.');
        return;
      }
    }

    await albumRef.set({
      status: requestedStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(requestedStatus === 'PUBLISHED' ? { isPublic: true, publishedAt: FieldValue.serverTimestamp(), publishedBy: auth.uid } : {})
    }, { merge: true });

    sendJson(res, 200, { ok: true, albumId, status: requestedStatus });
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  if (segments.length === 0) {
    const artistId = getQueryString(req, 'artistId');
    if (!artistId) {
      sendError(res, 400, 'bad_request', 'Se requiere el parámetro artistId.');
      return;
    }

    try {
      const albumList = await getAlbumsByArtist(db, artistId, viewerUid, viewerRole);
      sendJson(res, 200, { albums: albumList });
    } catch (err) {
      console.error('[albums] Error listing by artist:', err);
      sendError(res, 500, 'internal_error', 'Error interno al obtener álbumes.');
    }
    return;
  }

  if (segments.length === 1) {
    const albumId = segments[0];
    try {
      const album = await getAlbumById(db, albumId, viewerUid, viewerRole);
      if (!album) {
        sendError(res, 404, 'not_found', 'Álbum no encontrado.');
        return;
      }
      sendJson(res, 200, album);
    } catch (err) {
      console.error('[albums] Error fetching album:', err);
      sendError(res, 500, 'internal_error', 'Error interno al obtener el álbum.');
    }
    return;
  }

  sendError(res, 404, 'not_found', 'Endpoint no encontrado.');
});

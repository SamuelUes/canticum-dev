import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { getPathSegments, getQueryString, handlePreflight, sendError, sendJson } from '../../shared/http/http';

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
    isVerified: Boolean(data.isVerified)
  };
}

async function getAlbumById(db: FirebaseFirestore.Firestore, albumId: string): Promise<AlbumDetail | null> {
  const albumSnap = await db.collection('albums').doc(albumId).get();

  if (!albumSnap.exists) {
    return null;
  }

  const albumData = (albumSnap.data() ?? {}) as Record<string, unknown>;

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

  const albumSongsSnap = await db
    .collection('albumSongs')
    .where('albumId', '==', albumId)
    .orderBy('trackNumber', 'asc')
    .get();

  const songs: AlbumSongRow[] = [];

  if (!albumSongsSnap.empty) {
    const songFetches = albumSongsSnap.docs.map(async (junctionDoc) => {
      const jd = (junctionDoc.data() ?? {}) as Record<string, unknown>;
      const songId = String(jd.songId ?? '');
      if (!songId) return null;

      const songSnap = await db.collection('songs').doc(songId).get();
      if (!songSnap.exists) return null;

      const sd = (songSnap.data() ?? {}) as Record<string, unknown>;
      return buildSongRow(
        songSnap.id,
        sd,
        Number(jd.trackNumber ?? 0),
        Boolean(jd.isPrimaryRelease)
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

async function getAlbumsByArtist(db: FirebaseFirestore.Firestore, artistId: string): Promise<AlbumRef[]> {
  const snap = await db
    .collection('albums')
    .where('artistId', '==', artistId)
    .where('status', '==', 'PUBLISHED')
    .orderBy('releaseYear', 'desc')
    .get();

  return snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
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

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const segments = getPathSegments(req);
  const db = getAppFirestore();

  if (segments.length === 0) {
    const artistId = getQueryString(req, 'artistId');
    if (!artistId) {
      sendError(res, 400, 'bad_request', 'Se requiere el parámetro artistId.');
      return;
    }

    try {
      const albumList = await getAlbumsByArtist(db, artistId);
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
      const album = await getAlbumById(db, albumId);
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

import * as functions from 'firebase-functions/v1';
import '../../shared/firebaseAdmin';
import { getAppFirestore } from '../../shared/firestore';
import {
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  sendError,
  sendJson
} from '../../shared/http/http';
import {
  listActiveCategorySlugs as listActiveCategorySlugsInCloudSql,
  listTopArtists as listTopArtistsInCloudSql
} from '../../shared/cloudSql/artists';
import { listTopSongs as listTopSongsInCloudSql } from '../../shared/cloudSql/songs';
import { listFeaturedAlbumsSnapshot as listFeaturedAlbumsSnapshotInCloudSql } from '../../shared/cloudSql/albums';

// ── Response interfaces ──────────────────────────────────────────────

interface HomeImage {
  url: string;
  width?: number;
  height?: number;
}

interface HomeFeaturedSong {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isPremium: boolean;
  durationMs?: number;
}

interface HomeFeaturedAlbum {
  id: string;
  title: string;
  subtitle: string;
  coverUrl?: string;
  albumType?: string;
  releaseYear?: number;
  totalTracks?: number;
  popularity?: number;
}

interface HomeRecentSong {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
}

interface HomeArtist {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface HomeTrendItem {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
  rankDelta: number | null;
  score: number;
}

interface HomeOwnSong {
  id: string;
  songId: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  status: string;
  isPremium: boolean;
}

interface HomeOwnRepertoire {
  id: string;
  repertoireId: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isPublic: boolean;
  songsCount: number;
  status: string;
}

interface HomeNewsletterSlide {
  id: string;
  imageUrl: string;
}

interface HomeMisalRecord {
  id: string;
  title: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  createdAt: string | null;
}

interface HomeSundaySchema {
  id: string;
  title: string;
  content: string;
  storagePath: string;
  fileName: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  createdAt: string | null;
}

interface HomeResponse {
  featuredSongs: HomeFeaturedSong[];
  featuredAlbums: HomeFeaturedAlbum[];
  recentSongs: HomeRecentSong[];
  artists: HomeArtist[];
  trends: HomeTrendItem[];
  ownSongs: HomeOwnSong[];
  ownRepertoires: HomeOwnRepertoire[];
  categories: string[];
  newsletterSlides: HomeNewsletterSlide[];
  misales: HomeMisalRecord[];
  sundaySchema: HomeSundaySchema | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

const SHARED_HOME_CACHE_TTL_MS = 30_000;
const FEATURED_SONGS_LIMIT = 4;
const FEATURED_ALBUMS_LIMIT = 8;
const RECENT_SONGS_LIMIT = 6;
const ARTISTS_LIMIT = 24;
const TOP_SONGS_SQL_LIMIT = 60;
const TOP_ARTISTS_SQL_LIMIT = 40;
const FIRESTORE_SONG_SCAN_LIMIT = 80;
const MISAL_LIMIT = 3;

let sharedHomeCache: { payload: HomeResponse; expiresAt: number } | null = null;

function normalizeImages(raw: unknown, fallbackUrl?: string): HomeImage[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw
      .map((entry): HomeImage | null => {
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
      .filter((value): value is HomeImage => value !== null);
    if (list.length > 0) return list;
  }
  return fallbackUrl ? [{ url: fallbackUrl }] : undefined;
}

function pickImageUrl(raw: Record<string, unknown>): string | undefined {
  const images = normalizeImages(raw.images, typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl : undefined);
  return images && images.length > 0 ? images[0]?.url : undefined;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
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

function toComparableMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  return 0;
}

function getSongPublicSortMillis(data: Record<string, unknown>): number {
  return Math.max(
    toComparableMillis(data.publishedAt),
    toComparableMillis(data.approvedAt),
    toComparableMillis(data.updatedAt),
    toComparableMillis(data.createdAt)
  );
}

function resolveArtistName(raw: Record<string, unknown>, fallback: string): string {
  const candidates = [raw.name, raw.artistName, raw.displayName, raw.stageName, raw.title, raw.authorOrChoir]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return candidates[0] ?? fallback;
}

function isMeaningfulArtistName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0
    && normalized !== 'artista'
    && normalized !== 'artista sugerido'
    && normalized !== 'unknown';
}

// ── Featured artist trends (from Firestore) ──────────────────────────

interface FeaturedArtistSnapshotDoc {
  artistId: number;
  rankPosition: number;
  name: string;
  imageUrl?: string;
  score?: number;
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

async function getFeaturedArtistTrends(db: FirebaseFirestore.Firestore): Promise<HomeTrendItem[]> {
  const [currentArtists, pastArtists] = await Promise.all([
    readFeaturedArtistSnapshot(db, 'current'),
    readFeaturedArtistSnapshot(db, 'past')
  ]);

  const trends: HomeTrendItem[] = [];
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

// ── Newsletter slides (from Firestore) ───────────────────────────────

function normalizeNewsletterSlides(value: unknown): HomeNewsletterSlide[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): HomeNewsletterSlide | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === 'string' ? item.id : '';
      const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl : '';
      if (!id || !imageUrl) return null;
      return { id, imageUrl };
    })
    .filter((item): item is HomeNewsletterSlide => item !== null);
}

async function getNewsletterSlides(db: FirebaseFirestore.Firestore): Promise<HomeNewsletterSlide[]> {
  try {
    const doc = await db.collection('settings').doc('newsletter').get();
    if (!doc.exists) return [];
    const data = doc.data() as Record<string, unknown>;
    return normalizeNewsletterSlides(data.slides);
  } catch {
    return [];
  }
}

// ── Weekly misales (from Firestore) ──────────────────────────────────

function normalizeMisalDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): HomeMisalRecord | null {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const id = doc.id;
  const downloadUrl = typeof data.downloadUrl === 'string' ? data.downloadUrl : '';
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';
  if (!downloadUrl || !storagePath) return null;

  return {
    id,
    title: typeof data.title === 'string' && data.title.trim().length > 0 ? data.title.trim() : 'Misal Semanal',
    downloadUrl,
    storagePath,
    fileName: typeof data.fileName === 'string' ? data.fileName : 'misal-semanal.pdf',
    weekId: typeof data.weekId === 'string' ? data.weekId : '',
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : '',
    weekEnd: typeof data.weekEnd === 'string' ? data.weekEnd : '',
    createdAt: toIsoString(data.createdAt)
  };
}

async function getLatestMisales(db: FirebaseFirestore.Firestore, limit: number): Promise<HomeMisalRecord[]> {
  try {
    const snapshot = await db
      .collection('misal__plan')
      .orderBy('createdAt', 'desc')
      .limit(limit * 10)
      .get();

    return snapshot.docs
      .filter(doc => doc.id.startsWith('misal_'))
      .slice(0, limit)
      .map(normalizeMisalDoc)
      .filter((item): item is HomeMisalRecord => item !== null);
  } catch {
    return [];
  }
}

// ── Sunday schema (from Firestore) ───────────────────────────────────

function normalizeSundaySchemaDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): HomeSundaySchema | null {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const id = doc.id;
  const content = typeof data.content === 'string' ? data.content : '';
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';
  if (!content || !storagePath) return null;

  return {
    id,
    title: typeof data.title === 'string' && data.title.trim().length > 0 ? data.title.trim() : 'Esquema del domingo',
    content,
    storagePath,
    fileName: typeof data.fileName === 'string' ? data.fileName : 'esquema-domingo.txt',
    weekId: typeof data.weekId === 'string' ? data.weekId : '',
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : '',
    weekEnd: typeof data.weekEnd === 'string' ? data.weekEnd : '',
    createdAt: toIsoString(data.createdAt)
  };
}

async function getLatestSundaySchema(db: FirebaseFirestore.Firestore): Promise<HomeSundaySchema | null> {
  try {
    const snapshot = await db
      .collection('misal__plan')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const schemaDoc = snapshot.docs.find(doc => doc.id.startsWith('schema_'));
    if (!schemaDoc) return null;
    return normalizeSundaySchemaDoc(schemaDoc);
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────

export const home = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);

  if (segments.length > 0) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const auth = await getOptionalAuthContext(req);
  const currentUserId = auth?.uid ?? null;
  const isAdmin = (auth?.token.role as string | undefined) === 'admin';
  const db = getAppFirestore();

  const canUseSharedCache = !currentUserId;

  if (canUseSharedCache && sharedHomeCache && sharedHomeCache.expiresAt > Date.now()) {
    sendJson(res, 200, sharedHomeCache.payload);
    return;
  }

  // ── Parallel data fetching ────────────────────────────────────────

  const [
    publicSongsSnap,
    ownerSongsByOwnerIdSnap,
    ownerSongsByCreatedBySnap,
    adminSongsSnap,
    repertoiresSnap,
    artistsSnap,
    sqlTopSongs,
    sqlCategorySlugs,
    sqlArtists,
    sqlFeaturedAlbums,
    trends,
    newsletterSlides,
    misales,
    sundaySchema
  ] = await Promise.all([
    db.collection('songs')
      .where('status', 'in', ['APPROVED', 'PUBLISHED'])
      .limit(FIRESTORE_SONG_SCAN_LIMIT)
      .get(),
    currentUserId
      ? db.collection('songs').where('ownerUserId', '==', currentUserId).limit(FIRESTORE_SONG_SCAN_LIMIT).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
    currentUserId
      ? db.collection('songs').where('createdBy', '==', currentUserId).limit(FIRESTORE_SONG_SCAN_LIMIT).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
    isAdmin
      ? db.collection('songs').limit(FIRESTORE_SONG_SCAN_LIMIT).get()
      : Promise.resolve({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }),
    db.collection('repertoires').limit(FIRESTORE_SONG_SCAN_LIMIT).get(),
    db.collection('artists').limit(FIRESTORE_SONG_SCAN_LIMIT).get(),
    listTopSongsInCloudSql(TOP_SONGS_SQL_LIMIT).catch(() => null),
    listActiveCategorySlugsInCloudSql(300).catch(() => null),
    listTopArtistsInCloudSql(TOP_ARTISTS_SQL_LIMIT).catch(() => null),
    listFeaturedAlbumsSnapshotInCloudSql(FEATURED_ALBUMS_LIMIT).catch(() => null),
    getFeaturedArtistTrends(db).catch(() => [] as HomeTrendItem[]),
    getNewsletterSlides(db).catch(() => [] as HomeNewsletterSlide[]),
    getLatestMisales(db, MISAL_LIMIT).catch(() => [] as HomeMisalRecord[]),
    getLatestSundaySchema(db).catch(() => null)
  ]);

  // ── Build song items ──────────────────────────────────────────────

  interface SongItem {
    id: string;
    songId: string;
    title: string;
    subtitle: string;
    imageUrl?: string;
    isPremium: boolean;
    popularity: number;
    totalViews: number;
    likeCount: number;
    publishedAt: string | null;
    createdAt: string | null;
    ownerUserId: string;
    status: string;
    durationMs?: number;
  }

  const seenSongIds = new Set<string>();
  const seenSqlSongIds = new Set<number>();
  const allSongs: SongItem[] = [];

  function pushSong(doc: FirebaseFirestore.QueryDocumentSnapshot): void {
    if (seenSongIds.has(doc.id)) return;
    const data = doc.data() as Record<string, unknown>;
    const sqlSongId = Number(data.sqlSongId);
    const normalizedSqlSongId = Number.isFinite(sqlSongId) && sqlSongId > 0 ? Math.floor(sqlSongId) : null;
    if (normalizedSqlSongId && seenSqlSongIds.has(normalizedSqlSongId)) return;

    seenSongIds.add(doc.id);
    if (normalizedSqlSongId) seenSqlSongIds.add(normalizedSqlSongId);

    allSongs.push({
      id: doc.id,
      songId: doc.id,
      title: String(data.title ?? ''),
      subtitle: String(data.author ?? data.artistName ?? ''),
      imageUrl: pickImageUrl(data),
      isPremium: Boolean(data.isPremium),
      popularity: Number(data.popularity ?? 0) || 0,
      totalViews: Number(data.totalViews ?? 0) || 0,
      likeCount: Number(data.likeCount ?? 0) || 0,
      publishedAt: toIsoString(data.publishedAt),
      createdAt: toIsoString(data.createdAt),
      ownerUserId: String(data.ownerUserId ?? data.createdBy ?? ''),
      status: String(data.status ?? 'DRAFT').toUpperCase(),
      durationMs: Number.isFinite(Number(data.durationMs ?? data.duration_ms)) ? Number(data.durationMs ?? data.duration_ms) : undefined
    });
  }

  const publicSongDocs = [...publicSongsSnap.docs].sort((a, b) => {
    const aData = a.data() as Record<string, unknown>;
    const bData = b.data() as Record<string, unknown>;
    return getSongPublicSortMillis(bData) - getSongPublicSortMillis(aData);
  });

  publicSongDocs.forEach(pushSong);

  ownerSongsByOwnerIdSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (String(data.status ?? '').toUpperCase() === 'DRAFT') pushSong(doc);
  });

  ownerSongsByCreatedBySnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (String(data.status ?? '').toUpperCase() === 'DRAFT') pushSong(doc);
  });

  adminSongsSnap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const status = String(data.status ?? '').toUpperCase();
    if (['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED'].includes(status)) pushSong(doc);
  });

  // Merge SQL top songs
  if (sqlTopSongs) {
    sqlTopSongs.forEach((row) => {
      if (seenSqlSongIds.has(row.sqlSongId)) return;
      seenSqlSongIds.add(row.sqlSongId);
      seenSongIds.add(String(row.sqlSongId));

      allSongs.push({
        id: String(row.sqlSongId),
        songId: String(row.sqlSongId),
        title: row.title,
        subtitle: String(row.artistName ?? ''),
        imageUrl: undefined,
        isPremium: false,
        popularity: row.popularity,
        totalViews: row.totalViews,
        likeCount: row.likeCount,
        publishedAt: null,
        createdAt: null,
        ownerUserId: '',
        status: 'PUBLISHED',
        durationMs: row.durationMs
      });
    });
  }

  // ── Featured songs (top 4 by popularity) ──────────────────────────

  const featuredSongs: HomeFeaturedSong[] = [...allSongs]
    .filter((song) => !currentUserId || song.ownerUserId !== currentUserId)
    .sort((a, b) => {
      const popDelta = b.popularity - a.popularity;
      if (popDelta !== 0) return popDelta;
      const likesDelta = b.likeCount - a.likeCount;
      if (likesDelta !== 0) return likesDelta;
      const viewsDelta = b.totalViews - a.totalViews;
      if (viewsDelta !== 0) return viewsDelta;
      return toComparableMillis(b.publishedAt ?? b.createdAt) - toComparableMillis(a.publishedAt ?? a.createdAt);
    })
    .slice(0, FEATURED_SONGS_LIMIT)
    .map((song) => ({
      id: song.songId,
      title: song.title,
      subtitle: song.subtitle,
      imageUrl: song.imageUrl,
      isPremium: song.isPremium,
      durationMs: song.durationMs
    }));

  // ── Featured albums (from Cloud SQL snapshot) ────────────────────

  const featuredAlbums: HomeFeaturedAlbum[] = (sqlFeaturedAlbums ?? [])
    .map((row) => ({
      id: String(row.albumId),
      title: row.title,
      subtitle: row.artistName ?? 'Varios artistas',
      coverUrl: row.coverUrl ?? undefined,
      popularity: row.popularity,
      totalTracks: undefined,
      releaseYear: undefined,
      albumType: undefined
    }));

  // ── Recent songs (top 6 by date) ──────────────────────────────────

  const recentSongs: HomeRecentSong[] = [...allSongs]
    .sort((a, b) => toComparableMillis(b.publishedAt ?? b.createdAt) - toComparableMillis(a.publishedAt ?? a.createdAt))
    .slice(0, RECENT_SONGS_LIMIT)
    .map((song) => ({
      id: song.songId,
      title: song.title,
      subtitle: song.subtitle,
      avatarUrl: song.imageUrl
    }));

  // ── Own songs (for authenticated users) ───────────────────────────

  const ownSongs: HomeOwnSong[] = currentUserId
    ? allSongs
        .filter((song) => song.ownerUserId === currentUserId)
        .sort((a, b) => toComparableMillis(b.publishedAt ?? b.createdAt) - toComparableMillis(a.publishedAt ?? a.createdAt))
        .slice(0, 8)
        .map((song) => ({
          id: song.songId,
          songId: song.songId,
          title: song.title,
          subtitle: song.subtitle,
          imageUrl: song.imageUrl,
          status: song.status,
          isPremium: song.isPremium
        }))
    : [];

  // ── Artists ───────────────────────────────────────────────────────

  const firestoreArtists: HomeArtist[] = artistsSnap.docs
    .map((doc): HomeArtist | null => {
      const data = doc.data() as Record<string, unknown>;
      const name = resolveArtistName(data, 'Artista');
      if (!isMeaningfulArtistName(name)) return null;
      const images = normalizeImages(data.images, typeof data.imageUrl === 'string' ? data.imageUrl : undefined);
      return {
        id: doc.id,
        name,
        avatarUrl: images && images.length > 0 ? images[0]?.url : undefined
      };
    })
    .filter((item): item is HomeArtist => item !== null);

  const artistIndexById = new Map<string, number>();
  firestoreArtists.forEach((artist, index) => artistIndexById.set(artist.id, index));

  if (sqlArtists) {
    sqlArtists.forEach((artist) => {
      const artistId = String(artist.id);
      const name = resolveArtistName({ name: artist.name }, 'Artista');
      if (!isMeaningfulArtistName(name)) return;

      const sqlItem: HomeArtist = {
        id: artistId,
        name,
        avatarUrl: artist.imageUrl ?? undefined
      };

      const existingIndex = artistIndexById.get(artistId);
      if (existingIndex !== undefined) {
        const existing = firestoreArtists[existingIndex];
        if (!isMeaningfulArtistName(existing.name) && isMeaningfulArtistName(sqlItem.name)) {
          firestoreArtists[existingIndex] = sqlItem;
        }
        return;
      }

      firestoreArtists.push(sqlItem);
      artistIndexById.set(artistId, firestoreArtists.length - 1);
    });
  }

  const artists = firestoreArtists.slice(0, ARTISTS_LIMIT);

  // ── Own repertoires (for authenticated users) ─────────────────────

  const ownRepertoires: HomeOwnRepertoire[] = currentUserId
    ? repertoiresSnap.docs
        .filter((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const ownerUserId = String(data.userId ?? data.ownerUserId ?? '');
          const isPublic = Boolean(data.isPublic ?? data.visibility === 'public');
          return ownerUserId === currentUserId || (isPublic && isAdmin);
        })
        .sort((a, b) => {
          const aData = a.data() as Record<string, unknown>;
          const bData = b.data() as Record<string, unknown>;
          return toComparableMillis(bData.updatedAt ?? bData.createdAt) - toComparableMillis(aData.updatedAt ?? aData.createdAt);
        })
        .slice(0, 8)
        .map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const ownerUserId = String(data.userId ?? data.ownerUserId ?? '');
          const isPublic = Boolean(data.isPublic ?? data.visibility === 'public');
          const songIds = Array.isArray(data.songIds) ? data.songIds : [];
          const images = normalizeImages(
            data.images,
            typeof data.coverImageUrl === 'string'
              ? data.coverImageUrl
              : typeof data.coverUrl === 'string'
                ? data.coverUrl
                : undefined
          );
          return {
            id: doc.id,
            repertoireId: doc.id,
            title: String(data.title ?? ''),
            subtitle: String(data.liturgicalType ?? data.type ?? 'repertorio'),
            imageUrl: images && images.length > 0 ? images[0]?.url : undefined,
            isPublic,
            songsCount: Number(data.songsCount ?? songIds.length),
            status: String(data.status ?? (isPublic ? 'PUBLISHED' : 'DRAFT')).toUpperCase()
          };
        })
    : [];

  // ── Categories ────────────────────────────────────────────────────

  const categories = (sqlCategorySlugs ?? []).filter((slug) => slug && slug.trim().length > 0);

  // ── Assemble response ─────────────────────────────────────────────

  const payload: HomeResponse = {
    featuredSongs,
    featuredAlbums,
    recentSongs,
    artists,
    trends,
    ownSongs,
    ownRepertoires,
    categories,
    newsletterSlides,
    misales,
    sundaySchema
  };

  if (canUseSharedCache) {
    sharedHomeCache = {
      payload,
      expiresAt: Date.now() + SHARED_HOME_CACHE_TTL_MS
    };
  }

  sendJson(res, 200, payload);
});

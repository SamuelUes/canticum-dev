import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';
import type { ListItemData } from '../../types/home';

export interface FeaturedArtistTrend extends ListItemData {
  rankDelta: number | null;
  score: number;
}

export interface HomeFeaturedSong {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isPremium: boolean;
  durationMs?: number;
}

export interface HomeFeaturedAlbum {
  id: string;
  title: string;
  subtitle: string;
  coverUrl?: string;
  albumType?: string;
  releaseYear?: number;
  totalTracks?: number;
  popularity?: number;
}

export interface HomeRecentSong {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
}

export interface HomeArtist {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface HomeOwnSong {
  id: string;
  songId: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  status: string;
  isPremium: boolean;
}

export interface HomeOwnRepertoire {
  id: string;
  repertoireId: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  isPublic: boolean;
  songsCount: number;
  status: string;
}

export interface HomeNewsletterSlide {
  id: string;
  imageUrl: string;
}

export interface HomeMisalRecord {
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

export interface HomeSundaySchema {
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

export interface HomeData {
  featuredSongs: HomeFeaturedSong[];
  featuredAlbums: HomeFeaturedAlbum[];
  recentSongs: HomeRecentSong[];
  artists: HomeArtist[];
  trends: FeaturedArtistTrend[];
  ownSongs: HomeOwnSong[];
  ownRepertoires: HomeOwnRepertoire[];
  categories: string[];
  newsletterSlides: HomeNewsletterSlide[];
  misales: HomeMisalRecord[];
  sundaySchema: HomeSundaySchema | null;
}

const EMPTY_HOME_DATA: HomeData = {
  featuredSongs: [],
  featuredAlbums: [],
  recentSongs: [],
  artists: [],
  trends: [],
  ownSongs: [],
  ownRepertoires: [],
  categories: [],
  newsletterSlides: [],
  misales: [],
  sundaySchema: null
};

let inFlightHomeRequest: Promise<HomeData> | null = null;
let cachedHomeData: { data: HomeData; expiresAt: number } | null = null;
const HOME_CACHE_TTL_MS = 30_000;

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function normalizeTrend(raw: unknown): FeaturedArtistTrend | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  const rankDelta = item.rankDelta === null
    ? null
    : Number.isFinite(Number(item.rankDelta))
      ? Number(item.rankDelta)
      : null;

  return {
    id,
    title,
    subtitle: normalizeString(item.subtitle, 'General'),
    avatarUrl: normalizeOptionalString(item.avatarUrl),
    rankDelta,
    score: normalizeNumber(item.score)
  };
}

function normalizeFeaturedSong(raw: unknown): HomeFeaturedSong | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    subtitle: normalizeString(item.subtitle),
    imageUrl: normalizeOptionalString(item.imageUrl),
    isPremium: Boolean(item.isPremium),
    durationMs: normalizeOptionalNumber(item.durationMs)
  };
}

function normalizeFeaturedAlbum(raw: unknown): HomeFeaturedAlbum | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    subtitle: normalizeString(item.subtitle),
    coverUrl: normalizeOptionalString(item.coverUrl),
    albumType: normalizeOptionalString(item.albumType),
    releaseYear: normalizeOptionalNumber(item.releaseYear),
    totalTracks: normalizeOptionalNumber(item.totalTracks),
    popularity: normalizeOptionalNumber(item.popularity)
  };
}

function normalizeRecentSong(raw: unknown): HomeRecentSong | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    subtitle: normalizeString(item.subtitle),
    avatarUrl: normalizeOptionalString(item.avatarUrl)
  };
}

function normalizeArtist(raw: unknown): HomeArtist | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const name = normalizeString(item.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    avatarUrl: normalizeOptionalString(item.avatarUrl)
  };
}

function normalizeOwnSong(raw: unknown): HomeOwnSong | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const songId = normalizeString(item.songId, id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  return {
    id,
    songId,
    title,
    subtitle: normalizeString(item.subtitle),
    imageUrl: normalizeOptionalString(item.imageUrl),
    status: normalizeString(item.status, 'DRAFT').toUpperCase(),
    isPremium: Boolean(item.isPremium)
  };
}

function normalizeOwnRepertoire(raw: unknown): HomeOwnRepertoire | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const repertoireId = normalizeString(item.repertoireId, id);
  const title = normalizeString(item.title);
  if (!id || !title) return null;

  return {
    id,
    repertoireId,
    title,
    subtitle: normalizeString(item.subtitle),
    imageUrl: normalizeOptionalString(item.imageUrl),
    isPublic: Boolean(item.isPublic),
    songsCount: normalizeNumber(item.songsCount),
    status: normalizeString(item.status, 'DRAFT').toUpperCase()
  };
}

function normalizeNewsletterSlide(raw: unknown): HomeNewsletterSlide | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const imageUrl = normalizeString(item.imageUrl);
  if (!id || !imageUrl) return null;
  return { id, imageUrl };
}

function normalizeMisal(raw: unknown): HomeMisalRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const downloadUrl = normalizeString(item.downloadUrl);
  const storagePath = normalizeString(item.storagePath);
  if (!id || !downloadUrl || !storagePath) return null;

  return {
    id,
    title: normalizeString(item.title, 'Misal Semanal'),
    downloadUrl,
    storagePath,
    fileName: normalizeString(item.fileName, 'misal-semanal.pdf'),
    weekId: normalizeString(item.weekId),
    weekStart: normalizeString(item.weekStart),
    weekEnd: normalizeString(item.weekEnd),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
  };
}

function normalizeSundaySchema(raw: unknown): HomeSundaySchema | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeString(item.id);
  const content = normalizeString(item.content);
  const storagePath = normalizeString(item.storagePath);
  if (!id || !content || !storagePath) return null;

  return {
    id,
    title: normalizeString(item.title, 'Esquema del domingo'),
    content,
    storagePath,
    fileName: normalizeString(item.fileName, 'esquema-domingo.txt'),
    weekId: normalizeString(item.weekId),
    weekStart: normalizeString(item.weekStart),
    weekEnd: normalizeString(item.weekEnd),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
  };
}

function normalizeHomeData(raw: unknown): HomeData {
  if (!raw || typeof raw !== 'object') return EMPTY_HOME_DATA;
  const body = raw as Record<string, unknown>;

  return {
    featuredSongs: Array.isArray(body.featuredSongs)
      ? body.featuredSongs.map(normalizeFeaturedSong).filter((item): item is HomeFeaturedSong => item !== null)
      : [],
    featuredAlbums: Array.isArray(body.featuredAlbums)
      ? body.featuredAlbums.map(normalizeFeaturedAlbum).filter((item): item is HomeFeaturedAlbum => item !== null)
      : [],
    recentSongs: Array.isArray(body.recentSongs)
      ? body.recentSongs.map(normalizeRecentSong).filter((item): item is HomeRecentSong => item !== null)
      : [],
    artists: Array.isArray(body.artists)
      ? body.artists.map(normalizeArtist).filter((item): item is HomeArtist => item !== null)
      : [],
    trends: Array.isArray(body.trends)
      ? body.trends.map(normalizeTrend).filter((item): item is FeaturedArtistTrend => item !== null)
      : [],
    ownSongs: Array.isArray(body.ownSongs)
      ? body.ownSongs.map(normalizeOwnSong).filter((item): item is HomeOwnSong => item !== null)
      : [],
    ownRepertoires: Array.isArray(body.ownRepertoires)
      ? body.ownRepertoires.map(normalizeOwnRepertoire).filter((item): item is HomeOwnRepertoire => item !== null)
      : [],
    categories: Array.isArray(body.categories)
      ? body.categories.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    newsletterSlides: Array.isArray(body.newsletterSlides)
      ? body.newsletterSlides.map(normalizeNewsletterSlide).filter((item): item is HomeNewsletterSlide => item !== null)
      : [],
    misales: Array.isArray(body.misales)
      ? body.misales.map(normalizeMisal).filter((item): item is HomeMisalRecord => item !== null)
      : [],
    sundaySchema: normalizeSundaySchema(body.sundaySchema)
  };
}

export function getCachedHomeData(): HomeData | null {
  if (cachedHomeData && cachedHomeData.expiresAt > Date.now()) {
    return cachedHomeData.data;
  }
  return null;
}

export async function fetchHomeData(): Promise<HomeData> {
  const cached = getCachedHomeData();
  if (cached) return cached;

  if (inFlightHomeRequest) return inFlightHomeRequest;

  if (!functionsBaseUrl) return EMPTY_HOME_DATA;

  const requestPromise = (async (): Promise<HomeData> => {
    try {
      const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
      const response = await fetch(`${functionsBaseUrl}/home`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Home request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const normalized = normalizeHomeData(payload);
      cachedHomeData = {
        data: normalized,
        expiresAt: Date.now() + HOME_CACHE_TTL_MS
      };
      return normalized;
    } catch {
      return getCachedHomeData() ?? EMPTY_HOME_DATA;
    } finally {
      inFlightHomeRequest = null;
    }
  })();

  inFlightHomeRequest = requestPromise;
  return requestPromise;
}

// ── Legacy: featured artist trends (kept for backward compat) ────────

export async function fetchFeaturedArtistTrends(): Promise<FeaturedArtistTrend[]> {
  if (!functionsBaseUrl) return [];

  try {
    const response = await fetch(`${functionsBaseUrl}/artists/featured-trends`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return [];

    const body = await response.json() as { items?: unknown[] };
    return Array.isArray(body.items)
      ? body.items.map(normalizeTrend).filter((item): item is FeaturedArtistTrend => item !== null)
      : [];
  } catch {
    return [];
  }
}

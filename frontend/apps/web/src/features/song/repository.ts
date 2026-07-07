import { songMockById } from './mockData';
import type { SongDetail, SongImage, SongSimplifiedArtist } from '../../types/song';
import type { SongRef } from '../../types/repertoire';
import { invalidateAccountSummaryCache } from '../account/repository';
import { buildFunctionsHeaders, functionsBaseUrl, shouldUseMockFallback } from '../shared/functionsClient';
import { readClientCache, removeClientCacheByPrefix, writeClientCache } from '../shared/clientCache';

export interface SongVersionUpdatePayload {
  id?: string;
  versionId?: string;
  sqlSongVersionId?: number | string;
  versionName?: string;
  artistName?: string;
  instrumentName?: string;
  label?: string;
  lyrics?: string;
  audioReferenceUrl?: string | null;
  notationType?: string | null;
  tone?: string | null;
  coverImageUrl?: string | null;
  markedForDeletion?: boolean;
}

export interface SongUpdatePayload {
  title?: string;
  coverImageUrl?: string | null;
  status?: string;
  currentVersionId?: string;
  versions?: SongVersionUpdatePayload[];
}

export interface SongActionResult {
  ok: boolean;
  reason?: 'forbidden' | 'unauthorized' | 'not_found' | 'network' | 'unknown';
  message?: string;
  data?: {
    currentVersionId?: string;
    status?: string;
    updatedVersionIds?: string[];
    deletedVersionIds?: string[];
    createdVersionIds?: string[];
  };
}

const SONG_DETAIL_CACHE_PREFIX = 'canticum:song:detail:v1:';
const SONG_TITLE_CACHE_PREFIX = 'canticum:song:title:v1:';
const SONG_DETAIL_CACHE_TTL_MS = 180_000;

function getSongDetailCacheKey(songId: string, versionId?: string): string {
  return `${SONG_DETAIL_CACHE_PREFIX}${songId}:${versionId?.trim() || 'base'}`;
}

function getSongTitleCacheKey(songId: string, versionId?: string): string {
  return `${SONG_TITLE_CACHE_PREFIX}${songId}:${versionId?.trim() || 'base'}`;
}

export function invalidateSongCache(songId?: string): void {
  if (songId && songId.trim().length > 0) {
    removeClientCacheByPrefix(`${SONG_DETAIL_CACHE_PREFIX}${songId.trim()}:`);
    removeClientCacheByPrefix(`${SONG_TITLE_CACHE_PREFIX}${songId.trim()}:`);
    return;
  }

  removeClientCacheByPrefix(SONG_DETAIL_CACHE_PREFIX);
  removeClientCacheByPrefix(SONG_TITLE_CACHE_PREFIX);
}

function normalizeImages(raw: unknown): SongImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((entry): SongImage | null => {
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
    .filter((value): value is SongImage => value !== null);
  return list.length > 0 ? list : undefined;
}

function mapSongStatusToReason(status: number): SongActionResult['reason'] {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'unknown';
}

function computePopularity(durationOrViews: number | undefined): number {
  // Mirror the artist `popularity` derivation: log10-based 0-100 clamp.
  if (!Number.isFinite(durationOrViews) || !durationOrViews || durationOrViews <= 0) return 0;
  const score = Math.round(Math.log10(durationOrViews + 1) * 20);
  return Math.max(0, Math.min(100, score));
}

function normalizeSongDetail(song: SongDetail): SongDetail {
  const userAccess = {
    isAuthenticated: Boolean(song.userAccess?.isAuthenticated),
    isPremiumUser: Boolean(song.userAccess?.isPremiumUser),
    hasSongUnlock: Boolean(song.userAccess?.hasSongUnlock),
    canPurchaseIndividually: Boolean(song.userAccess?.canPurchaseIndividually),
    individualPriceUsd: song.userAccess?.individualPriceUsd
  };

  // Spotify-aligned aliases: `name` mirrors `title`, `previewUrl` mirrors `audioUrl`.
  const name = song.name ?? song.title;
  const previewUrl = song.previewUrl ?? song.audioUrl;
  const audioUrl = song.audioUrl ?? song.previewUrl;
  const images = normalizeImages(song.images) ?? song.images;

  // Derive `artists[]` from single `artistName` when absent (back-compat).
  const artists: SongSimplifiedArtist[] | undefined = song.artists && song.artists.length > 0
    ? song.artists
    : song.artistName
      ? [{ id: '', name: song.artistName, type: 'artist' }]
      : undefined;

  const popularity = typeof song.popularity === 'number'
    ? Math.max(0, Math.min(100, Math.round(song.popularity)))
    : computePopularity(song.durationMs);

  return {
    ...song,
    type: 'song',
    name,
    previewUrl,
    audioUrl,
    images,
    artists,
    discNumber: song.discNumber ?? 1,
    popularity,
    userAccess,
    versions: song.versions.map((version) => ({
      ...version,
      songId: version.songId ?? song.id,
      versionId: version.versionId ?? version.id,
      versionName: version.versionName ?? version.label,
      isPremium: Boolean(version.isPremium),
      audioReferenceUrl: version.audioReferenceUrl ?? audioUrl
    }))
  };
}

function isSongDetail(value: unknown): value is SongDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const song = value as Partial<SongDetail>;
  return typeof song.id === 'string' && typeof song.title === 'string' && Array.isArray(song.versions) && Array.isArray(song.instruments);
}

function extractSongPayload(payload: unknown): SongDetail | null {
  if (isSongDetail(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { song?: unknown };
  return isSongDetail(envelope.song) ? envelope.song : null;
}

interface SongRequestOptions {
  authToken?: string | null;
}

function withOptionalAuthHeader(headers: Record<string, string>, authToken?: string | null): Record<string, string> {
  const token = typeof authToken === 'string' ? authToken.trim() : '';
  if (!token || headers.Authorization) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
}

async function getSongDetailFromFunctions(
  songId: string,
  versionId?: string,
  options: SongRequestOptions = {}
): Promise<SongDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  const cacheKey = getSongDetailCacheKey(songId, versionId);
  const cached = readClientCache<SongDetail>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const headers = withOptionalAuthHeader(
      await buildFunctionsHeaders({ Accept: 'application/json' }),
      options.authToken
    );
    const qs = versionId && versionId.trim()
      ? `?versionId=${encodeURIComponent(versionId.trim())}`
      : '';

    const response = await fetch(`${functionsBaseUrl}/songs/${songId}${qs}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const song = extractSongPayload(payload);

    if (!song) {
      return null;
    }

    const normalized = normalizeSongDetail(song);
    writeClientCache(cacheKey, normalized, SONG_DETAIL_CACHE_TTL_MS);
    return normalized;
  } catch {
    return null;
  }
}

export async function getSongDetailById(
  songId: string,
  versionId?: string,
  options: SongRequestOptions = {}
): Promise<SongDetail | null> {
  const remoteSong = await getSongDetailFromFunctions(songId, versionId, options);

  if (remoteSong) {
    return remoteSong;
  }

  if (!shouldUseMockFallback()) {
    return null;
  }

  const song = songMockById[songId];

  if (!song) {
    return null;
  }

  return normalizeSongDetail(song);
}

export async function getSongTitleById(songId: string, versionId?: string): Promise<SongRef | null> {
  const cacheKey = getSongTitleCacheKey(songId, versionId);
  const cached = readClientCache<SongRef>(cacheKey);
  if (cached) {
    return cached;
  }

  const detailCacheKey = getSongDetailCacheKey(songId, versionId);
  const cachedDetail = readClientCache<SongDetail>(detailCacheKey);
  if (cachedDetail) {
    const fromDetail: SongRef = {
      id: cachedDetail.id,
      title: cachedDetail.title,
      artistName: cachedDetail.artistName,
      audioUrl: cachedDetail.audioUrl,
      ...(versionId ? { versionId } : {})
    };
    writeClientCache(cacheKey, fromDetail, SONG_DETAIL_CACHE_TTL_MS);
    return fromDetail;
  }

  if (functionsBaseUrl) {
    try {
      const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
      const response = await fetch(`${functionsBaseUrl}/songs/${songId}`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (response.ok) {
        const payload = (await response.json()) as unknown;
        const raw = (payload && typeof payload === 'object' && 'song' in (payload as object)
          ? (payload as { song: unknown }).song
          : payload) as (Partial<SongDetail> & { versions?: Array<Record<string, unknown>> }) | null;

        if (raw && typeof raw.id === 'string' && typeof raw.title === 'string') {
          const resolvedVersionId = (() => {
            if (!versionId || !Array.isArray(raw.versions)) {
              return versionId;
            }

            const exact = raw.versions.find((version) => {
              const versionRecord = version as unknown as Record<string, unknown>;
              const candidateVersionId = String(versionRecord.versionId ?? versionRecord.id ?? '');
              const candidateSqlVersionId = String(versionRecord.sqlSongVersionId ?? '');
              return candidateVersionId === versionId || candidateSqlVersionId === versionId;
            });

            if (!exact) {
              return versionId;
            }

            const canonical = String(exact.versionId ?? exact.id ?? '');
            return canonical || versionId;
          })();

          const result: SongRef = {
            id: raw.id,
            title: raw.title,
            artistName: typeof raw.artistName === 'string' ? raw.artistName : undefined,
            audioUrl: typeof raw.audioUrl === 'string' ? raw.audioUrl : undefined,
            ...(resolvedVersionId ? { versionId: resolvedVersionId } : {})
          };
          writeClientCache(cacheKey, result, SONG_DETAIL_CACHE_TTL_MS);
          return result;
        }
      }
    } catch {
    }
  }

  if (!shouldUseMockFallback()) {
    return null;
  }

  const mock = songMockById[songId];
  if (!mock) {
    return null;
  }

  const fallback: SongRef = {
    id: mock.id,
    title: mock.title,
    artistName: mock.artistName,
    audioUrl: mock.audioUrl,
    ...(versionId ? { versionId } : {})
  };
  writeClientCache(cacheKey, fallback, SONG_DETAIL_CACHE_TTL_MS);
  return fallback;
}

export async function requestUpdateSong(songId: string, update: SongUpdatePayload): Promise<SongActionResult> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network', message: 'Functions base URL no configurada.' };
  }

  try {
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/songs/${songId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(update)
    });

    if (!response.ok) {
      return { ok: false, reason: mapSongStatusToReason(response.status) };
    }

    const payload = (await response.json()) as {
      status?: string;
      currentVersionId?: string;
      updatedVersionIds?: string[];
      deletedVersionIds?: string[];
      createdVersionIds?: string[];
    };

    invalidateSongCache(songId);
    invalidateAccountSummaryCache();
    return {
      ok: true,
      data: {
        status: payload.status,
        currentVersionId: payload.currentVersionId,
        updatedVersionIds: Array.isArray(payload.updatedVersionIds) ? payload.updatedVersionIds : [],
        deletedVersionIds: Array.isArray(payload.deletedVersionIds) ? payload.deletedVersionIds : [],
        createdVersionIds: Array.isArray(payload.createdVersionIds) ? payload.createdVersionIds : []
      }
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function requestDeleteSong(songId: string): Promise<SongActionResult> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network', message: 'Functions base URL no configurada.' };
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const response = await fetch(`${functionsBaseUrl}/songs/${songId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      return { ok: false, reason: mapSongStatusToReason(response.status) };
    }

    invalidateSongCache(songId);
    invalidateAccountSummaryCache();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}


export async function requestUpdateSongStatus(songId: string, status: string): Promise<SongActionResult> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network', message: 'Functions base URL no configurada.' };
  }

  try {
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/songs/${songId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      return { ok: false, reason: mapSongStatusToReason(response.status) };
    }

    const payload = (await response.json()) as { status?: string };
    invalidateSongCache(songId);
    invalidateAccountSummaryCache();
    return { ok: true, data: { status: payload.status } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

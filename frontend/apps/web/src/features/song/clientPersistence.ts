import { invalidateAccountSummaryCache } from '../account/repository';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';

export interface SongUserPreferences {
  currentVersionId?: string;
  currentInstrumentId?: string;
}

function arePreferencesEqual(a: SongUserPreferences | null, b: SongUserPreferences | null): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.currentVersionId === b.currentVersionId && a.currentInstrumentId === b.currentInstrumentId;
}

function readLocalFavorite(songId: string, versionId: string): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getFavoriteStorageKey(songId, versionId));
    if (!raw) {
      return null;
    }

    return raw === '1';
  } catch {
    return null;
  }
}

export async function requestTrackSongListen(songId: string): Promise<boolean> {
  if (!functionsBaseUrl) {
    return false;
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/songs/${encodeURIComponent(songId)}/listen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });

    return response.ok;
  } catch {
    return false;
  }
}

function getFavoriteCompoundKey(songId: string, versionId: string): string {
  return `${songId}::${versionId}`;
}

function saveLocalFavorite(songId: string, versionId: string, isFavorite: boolean): boolean {
  favoriteCache.set(getFavoriteCompoundKey(songId, versionId), isFavorite);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getFavoriteStorageKey(songId, versionId), isFavorite ? '1' : '0');
  }

  return isFavorite;
}

const REMOTE_SYNC_DEBOUNCE_MS = 320;

const preferencesCache = new Map<string, SongUserPreferences>();
const pendingLoads = new Map<string, Promise<SongUserPreferences | null>>();
const pendingSyncTimeout = new Map<string, number>();
const lastSyncedPayloadBySong = new Map<string, string>();

const favoriteCache = new Map<string, boolean>();
const pendingFavoriteLoads = new Map<string, Promise<boolean | null>>();
const pendingFavoriteSyncTimeout = new Map<string, number>();
const lastSyncedFavoriteBySong = new Map<string, boolean>();

export function clearAllPendingClientSyncs(): void {
  if (typeof window === 'undefined') {
    return;
  }

  pendingSyncTimeout.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  pendingSyncTimeout.clear();

  pendingFavoriteSyncTimeout.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  pendingFavoriteSyncTimeout.clear();

  pendingLoads.clear();
  pendingFavoriteLoads.clear();
  preferencesCache.clear();
  favoriteCache.clear();
  lastSyncedPayloadBySong.clear();
  lastSyncedFavoriteBySong.clear();
}

function getPreferencesStorageKey(songId: string): string {
  return `song-preferences:${songId}`;
}

function getFavoriteStorageKey(songId: string, versionId: string): string {
  return `song-favorite:${songId}:${versionId}`;
}

async function getCurrentUserId(): Promise<string> {
  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  if (!hasFirebaseConfig) {
    return 'anonymous';
  }

  try {
    const { auth } = await import('../../services/firebase');
    return auth.currentUser?.uid ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function readLocalPreferences(songId: string): SongUserPreferences | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getPreferencesStorageKey(songId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as SongUserPreferences;
  } catch {
    return null;
  }
}

function saveLocalPreferences(songId: string, preferences: SongUserPreferences): SongUserPreferences {
  const merged = {
    ...(readLocalPreferences(songId) ?? {}),
    ...preferences
  };

  preferencesCache.set(songId, merged);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getPreferencesStorageKey(songId), JSON.stringify(merged));
  }

  return merged;
}

function isSongUserPreferences(value: unknown): value is SongUserPreferences {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preferences = value as SongUserPreferences;
  return typeof preferences.currentVersionId === 'string' || typeof preferences.currentInstrumentId === 'string';
}

function extractPreferencesPayload(payload: unknown): SongUserPreferences | null {
  if (isSongUserPreferences(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { preferences?: unknown };
  return isSongUserPreferences(envelope.preferences) ? envelope.preferences : null;
}

export async function loadSongUserPreferences(songId: string): Promise<SongUserPreferences | null> {
  const cached = preferencesCache.get(songId) ?? null;
  if (cached) {
    return cached;
  }

  const inflight = pendingLoads.get(songId);
  if (inflight) {
    return inflight;
  }

  const local = readLocalPreferences(songId);
  if (local) {
    preferencesCache.set(songId, local);
  }

  if (!functionsBaseUrl) {
    return local;
  }

  const loadTask = (async () => {
    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return local;
      }

      const headers = await buildFunctionsHeaders({
        Accept: 'application/json'
      });
      const response = await fetch(`${functionsBaseUrl}/songs/${songId}/preferences?userId=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        return local;
      }

      const payload = (await response.json()) as unknown;
      const remote = extractPreferencesPayload(payload);

      if (!remote) {
        return local;
      }

      return saveLocalPreferences(songId, remote);
    } catch {
      return local;
    } finally {
      pendingLoads.delete(songId);
    }
  })();

  pendingLoads.set(songId, loadTask);
  return loadTask;
}

export async function saveSongUserPreferences(songId: string, preferences: SongUserPreferences): Promise<void> {
  const cached = preferencesCache.get(songId) ?? readLocalPreferences(songId);
  const merged = saveLocalPreferences(songId, preferences);

  if (arePreferencesEqual(cached ?? null, merged)) {
    return;
  }

  if (!functionsBaseUrl) {
    return;
  }

  const existingTimeout = pendingSyncTimeout.get(songId);
  if (typeof existingTimeout === 'number') {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(async () => {
    pendingSyncTimeout.delete(songId);

    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return;
      }

      const headers = await buildFunctionsHeaders({
        'Content-Type': 'application/json'
      });
      const payload = JSON.stringify({ userId, preferences: merged });

      if (lastSyncedPayloadBySong.get(songId) === payload) {
        return;
      }

      const response = await fetch(`${functionsBaseUrl}/songs/${songId}/preferences`, {
        method: 'POST',
        headers,
        body: payload
      });

      if (response.ok) {
        lastSyncedPayloadBySong.set(songId, payload);
      }
    } catch {
      return;
    }
  }, REMOTE_SYNC_DEBOUNCE_MS);

  pendingSyncTimeout.set(songId, timeoutId);
}

export async function loadSongFavorite(songId: string, versionId: string): Promise<boolean | null> {
  const favoriteKey = getFavoriteCompoundKey(songId, versionId);
  const cached = favoriteCache.get(favoriteKey);
  if (typeof cached === 'boolean') {
    return cached;
  }

  const inflight = pendingFavoriteLoads.get(favoriteKey);
  if (inflight) {
    return inflight;
  }

  const local = readLocalFavorite(songId, versionId);
  if (typeof local === 'boolean') {
    favoriteCache.set(favoriteKey, local);
  }

  if (!functionsBaseUrl) {
    return local;
  }

  const task = (async () => {
    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return local;
      }

      const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
      const response = await fetch(`${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/songs/${encodeURIComponent(songId)}/${encodeURIComponent(versionId)}`, {
        method: 'GET',
        headers
      });

      if (response.status === 404) {
        return saveLocalFavorite(songId, versionId, false);
      }

      if (!response.ok) {
        return local;
      }

      const payload = (await response.json()) as { isFavorite?: boolean; favorite?: { isFavorite?: boolean } };
      const remoteFavorite = payload.favorite?.isFavorite ?? payload.isFavorite;

      if (typeof remoteFavorite !== 'boolean') {
        return local;
      }

      return saveLocalFavorite(songId, versionId, remoteFavorite);
    } catch {
      return local;
    } finally {
      pendingFavoriteLoads.delete(favoriteKey);
    }
  })();

  pendingFavoriteLoads.set(favoriteKey, task);
  return task;
}

export async function saveSongFavorite(songId: string, versionId: string, isFavorite: boolean): Promise<void> {
  const favoriteKey = getFavoriteCompoundKey(songId, versionId);
  const cached = favoriteCache.get(favoriteKey);
  const merged = saveLocalFavorite(songId, versionId, isFavorite);

  if (cached === merged) {
    return;
  }

  if (!functionsBaseUrl) {
    return;
  }

  const existingTimeout = pendingFavoriteSyncTimeout.get(favoriteKey);
  if (typeof existingTimeout === 'number') {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(async () => {
    pendingFavoriteSyncTimeout.delete(favoriteKey);

    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return;
      }

      if (lastSyncedFavoriteBySong.get(favoriteKey) === merged) {
        return;
      }

      const headers = await buildFunctionsHeaders({
        'Content-Type': 'application/json'
      });

      const response = await fetch(
        `${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/songs/${encodeURIComponent(songId)}/${encodeURIComponent(versionId)}`,
        {
        method: merged ? 'PUT' : 'DELETE',
        headers
        }
      );

      if (response.ok) {
        lastSyncedFavoriteBySong.set(favoriteKey, merged);
      } else if (response.status === 403) {
        try {
          const err = (await response.json()) as { error?: { code?: string; message?: string } };
          if (err.error?.code === 'plan_limit') {
            saveLocalFavorite(songId, versionId, !merged);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('canticum:plan_limit', { detail: { message: err.error.message } }));
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch {
      return;
    }
  }, REMOTE_SYNC_DEBOUNCE_MS);

  pendingFavoriteSyncTimeout.set(favoriteKey, timeoutId);
}

export interface CreateSongPayloadInstrumentation {
  instrumentationId?: string;
  instrumentName: string;
  lyrics?: string;
  lyricsFileUrl?: string;
  sheetFileUrl?: string;
  audioReferenceUrl?: string;
  tone?: string;
  notationType?: string;
}

export interface CreateSongPayloadVersion {
  /** Client-pre-generated Firestore version doc id; backend will use it verbatim. */
  versionDocId?: string;
  versionName: string;
  artistId?: number;
  artistName?: string;
  isOwnVersion?: boolean;
  audioMode: 'shared' | 'per_instrumentation';
  audioReferenceUrl?: string;
  coverImageUrl?: string;
  instrumentations?: CreateSongPayloadInstrumentation[];
  // Legacy fields for backward compatibility
  instrumentName?: string;
  tone?: string;
  notationType?: string;
  /** Per-version lyrics text (replaces the previous song-level `lyrics`). */
  lyrics?: string;
  /** Optional uploaded lyrics file URL. */
  lyricsFileUrl?: string;
  /** Optional uploaded sheet music file URL. */
  sheetFileUrl?: string;
}

export interface CreateSongPayload {
  /** 'new' creates a song + versions; 'addVersion' appends versions to an existing song. */
  mode?: 'new' | 'addVersion';
  /** Required when mode='addVersion': target song Firestore id. */
  songId?: string;
  /** Optional client-pre-generated Firestore song id (mode='new'). */
  songDocId?: string;
  title?: string;
  artistId?: number;
  artistName?: string;
  year?: number;
  liturgicalUse?: string;
  coverImageUrl?: string;
  /** @deprecated Use per-version `lyrics` instead. Kept for legacy callers. */
  lyrics?: string;
  versionName?: string;
  instruments?: string[];
  tone?: string;
  notationType?: string;
  audioReferenceUrl?: string;
  versions?: CreateSongPayloadVersion[];
}

export interface SongActionResult {
  ok: boolean;
  songId?: string;
  versionIds?: string[];
  reason?: 'forbidden' | 'unauthorized' | 'network' | 'plan_limit' | 'unknown';
  message?: string;
}

export async function requestCreateSong(payload: CreateSongPayload): Promise<SongActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true, songId: `local-${Date.now()}` };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/songs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, ...payload })
    });

    if (!response.ok) {
      if (response.status === 403) {
        try {
          const body = (await response.json()) as { error?: { code?: string; message?: string } };
          if (body.error?.code === 'plan_limit') {
            return { ok: false, reason: 'plan_limit', message: body.error.message };
          }
        } catch { /* ignore */ }
        return { ok: false, reason: 'forbidden' };
      }
      if (response.status === 401) return { ok: false, reason: 'unauthorized' };
      return { ok: false, reason: 'unknown' };
    }

    const data = (await response.json()) as {
      song?: { id?: string };
      songId?: string;
      versionIds?: string[];
    };
    invalidateAccountSummaryCache();
    return {
      ok: true,
      songId: data.song?.id ?? data.songId,
      versionIds: Array.isArray(data.versionIds) ? data.versionIds.filter((v) => typeof v === 'string') : undefined
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function requestSongPurchaseIntent(songId: string): Promise<{ checkoutUrl?: string } | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/songs/${songId}/purchase-intent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { checkoutUrl?: string };
    return payload;
  } catch {
    return null;
  }
}

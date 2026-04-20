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

function readLocalFavorite(songId: string): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getFavoriteStorageKey(songId));
    if (!raw) {
      return null;
    }

    return raw === '1';
  } catch {
    return null;
  }
}

async function getAuthIdToken(): Promise<string | null> {
  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  if (!hasFirebaseConfig) {
    return null;
  }

  try {
    const { auth } = await import('../../services/firebase');
    if (!auth.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function buildAuthHeaders(baseHeaders: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAuthIdToken();

  if (!token) {
    return baseHeaders;
  }

  return {
    ...baseHeaders,
    Authorization: `Bearer ${token}`
  };
}

function saveLocalFavorite(songId: string, isFavorite: boolean): boolean {
  favoriteCache.set(songId, isFavorite);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getFavoriteStorageKey(songId), isFavorite ? '1' : '0');
  }

  return isFavorite;
}

const functionsBaseUrl = (process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');
const REMOTE_SYNC_DEBOUNCE_MS = 320;

const preferencesCache = new Map<string, SongUserPreferences>();
const pendingLoads = new Map<string, Promise<SongUserPreferences | null>>();
const pendingSyncTimeout = new Map<string, number>();
const lastSyncedPayloadBySong = new Map<string, string>();

const favoriteCache = new Map<string, boolean>();
const pendingFavoriteLoads = new Map<string, Promise<boolean | null>>();
const pendingFavoriteSyncTimeout = new Map<string, number>();
const lastSyncedFavoriteBySong = new Map<string, boolean>();

function getPreferencesStorageKey(songId: string): string {
  return `song-preferences:${songId}`;
}

function getFavoriteStorageKey(songId: string): string {
  return `song-favorite:${songId}`;
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
      const headers = await buildAuthHeaders({
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
      const headers = await buildAuthHeaders({
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

export async function loadSongFavorite(songId: string): Promise<boolean | null> {
  const cached = favoriteCache.get(songId);
  if (typeof cached === 'boolean') {
    return cached;
  }

  const inflight = pendingFavoriteLoads.get(songId);
  if (inflight) {
    return inflight;
  }

  const local = readLocalFavorite(songId);
  if (typeof local === 'boolean') {
    favoriteCache.set(songId, local);
  }

  if (!functionsBaseUrl) {
    return local;
  }

  const task = (async () => {
    try {
      const userId = await getCurrentUserId();
      const headers = await buildAuthHeaders({ Accept: 'application/json' });
      const response = await fetch(`${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/${songId}`, {
        method: 'GET',
        headers
      });

      if (response.status === 404) {
        return saveLocalFavorite(songId, false);
      }

      if (!response.ok) {
        return local;
      }

      const payload = (await response.json()) as { isFavorite?: boolean; favorite?: { isFavorite?: boolean } };
      const remoteFavorite = payload.favorite?.isFavorite ?? payload.isFavorite;

      if (typeof remoteFavorite !== 'boolean') {
        return local;
      }

      return saveLocalFavorite(songId, remoteFavorite);
    } catch {
      return local;
    } finally {
      pendingFavoriteLoads.delete(songId);
    }
  })();

  pendingFavoriteLoads.set(songId, task);
  return task;
}

export async function saveSongFavorite(songId: string, isFavorite: boolean): Promise<void> {
  const cached = favoriteCache.get(songId);
  const merged = saveLocalFavorite(songId, isFavorite);

  if (cached === merged) {
    return;
  }

  if (!functionsBaseUrl) {
    return;
  }

  const existingTimeout = pendingFavoriteSyncTimeout.get(songId);
  if (typeof existingTimeout === 'number') {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(async () => {
    pendingFavoriteSyncTimeout.delete(songId);

    try {
      const userId = await getCurrentUserId();

      if (lastSyncedFavoriteBySong.get(songId) === merged) {
        return;
      }

      const headers = await buildAuthHeaders({
        'Content-Type': 'application/json'
      });

      const response = await fetch(`${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/${songId}`, {
        method: merged ? 'PUT' : 'DELETE',
        headers
      });

      if (response.ok) {
        lastSyncedFavoriteBySong.set(songId, merged);
      } else if (response.status === 403) {
        try {
          const err = (await response.json()) as { error?: { code?: string; message?: string } };
          if (err.error?.code === 'plan_limit') {
            saveLocalFavorite(songId, !merged);
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

  pendingFavoriteSyncTimeout.set(songId, timeoutId);
}

export interface CreateSongPayload {
  title: string;
  artistName?: string;
  year?: number;
  liturgicalUse?: string;
  lyrics: string;
  tone?: string;
  notationType?: string;
  audioReferenceUrl?: string;
}

export interface SongActionResult {
  ok: boolean;
  songId?: string;
  reason?: 'forbidden' | 'unauthorized' | 'network' | 'plan_limit' | 'unknown';
  message?: string;
}

export async function requestCreateSong(payload: CreateSongPayload): Promise<SongActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true, songId: `local-${Date.now()}` };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
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

    const data = (await response.json()) as { song?: { id?: string } };
    return { ok: true, songId: data.song?.id };
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
    const headers = await buildAuthHeaders({
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

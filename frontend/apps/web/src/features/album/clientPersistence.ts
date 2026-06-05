import { buildFunctionsHeaders as buildSharedFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';
import type { CreateAlbumPayload } from '../../types/album';

const ALBUM_FAVORITE_CACHE_PREFIX = 'canticum:album:favorite:v1:';

const albumFavoriteCache = new Map<string, boolean>();
const pendingAlbumFavoriteLoads = new Map<string, Promise<boolean | null>>();
const pendingAlbumFavoriteSyncTimeout = new Map<string, number>();
const lastSyncedAlbumFavorite = new Map<string, boolean>();

function getAlbumFavoriteCompoundKey(albumId: string): string {
  return `${ALBUM_FAVORITE_CACHE_PREFIX}${albumId}`;
}

function getAlbumFavoriteStorageKey(albumId: string): string {
  return `album-favorite:${albumId}`;
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

function readLocalAlbumFavorite(albumId: string): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getAlbumFavoriteStorageKey(albumId));
    return raw === '1' ? true : raw === '0' ? false : null;
  } catch {
    return null;
  }
}

function saveLocalAlbumFavorite(albumId: string, isFavorite: boolean): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(getAlbumFavoriteStorageKey(albumId), isFavorite ? '1' : '0');
    albumFavoriteCache.set(getAlbumFavoriteCompoundKey(albumId), isFavorite);
    return isFavorite;
  } catch {
    return false;
  }
}

export interface CreateAlbumResult {
  ok: boolean;
  albumId?: string;
  reason?: 'forbidden' | 'unauthorized' | 'network' | 'unknown';
  error?: string;
}

function mapAlbumStatusToReason(status: number): CreateAlbumResult['reason'] {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'unknown';
}

export async function requestCreateAlbum(payload: CreateAlbumPayload): Promise<CreateAlbumResult> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network', error: 'Backend no configurado.' };
  }

  try {
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/albums`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const reason = mapAlbumStatusToReason(response.status);
      let errorMessage = 'No se pudo crear el álbum.';
      
      try {
        const errorPayload = (await response.json()) as { error?: { message?: string } };
        if (errorPayload.error?.message) {
          errorMessage = errorPayload.error.message;
        }
      } catch {
        // Ignore JSON parse errors
      }

      return { ok: false, reason, error: errorMessage };
    }

    const resultPayload = (await response.json()) as { albumId?: string };
    return {
      ok: true,
      albumId: resultPayload.albumId
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return { ok: false, reason: 'network', error: message };
  }
}

async function buildFunctionsHeaders(additional: Record<string, string> = {}): Promise<HeadersInit> {
  return buildSharedFunctionsHeaders(additional);
}

export async function loadAlbumFavorite(albumId: string): Promise<boolean | null> {
  const favoriteKey = getAlbumFavoriteCompoundKey(albumId);
  const cached = albumFavoriteCache.get(favoriteKey);
  if (typeof cached === 'boolean') return cached;

  const inflight = pendingAlbumFavoriteLoads.get(favoriteKey);
  if (inflight) return inflight;

  const local = readLocalAlbumFavorite(albumId);
  if (typeof local === 'boolean') {
    albumFavoriteCache.set(favoriteKey, local);
    return local;
  }

  if (!functionsBaseUrl) {
    albumFavoriteCache.set(favoriteKey, false);
    return false;
  }

  const task = (async () => {
    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return saveLocalAlbumFavorite(albumId, false);
      }

      const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
      const response = await fetch(`${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/albums/${encodeURIComponent(albumId)}`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (!response.ok) {
        return saveLocalAlbumFavorite(albumId, false);
      }

      const payload = (await response.json()) as { isFavorite?: boolean; favorite?: { isFavorite?: boolean } };
      const remoteFavorite = payload.favorite?.isFavorite ?? payload.isFavorite;

      if (typeof remoteFavorite !== 'boolean') {
        return saveLocalAlbumFavorite(albumId, false);
      }

      return saveLocalAlbumFavorite(albumId, remoteFavorite);
    } catch {
      return saveLocalAlbumFavorite(albumId, false);
    } finally {
      pendingAlbumFavoriteLoads.delete(favoriteKey);
    }
  })();

  pendingAlbumFavoriteLoads.set(favoriteKey, task);
  return task;
}

export async function saveAlbumFavorite(albumId: string, isFavorite: boolean): Promise<void> {
  const favoriteKey = getAlbumFavoriteCompoundKey(albumId);
  const cached = albumFavoriteCache.get(favoriteKey);
  const merged = saveLocalAlbumFavorite(albumId, isFavorite);

  if (cached === merged) return;

  if (!functionsBaseUrl) return;

  const existingTimeout = pendingAlbumFavoriteSyncTimeout.get(favoriteKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    pendingAlbumFavoriteSyncTimeout.delete(favoriteKey);
  }

  if (lastSyncedAlbumFavorite.get(favoriteKey) === merged) return;

  const timeoutId = setTimeout(async () => {
    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return;
      }

      const headers = await buildFunctionsHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json'
      });

      const response = await fetch(
        `${functionsBaseUrl}/users/${encodeURIComponent(userId)}/favorites/albums/${encodeURIComponent(albumId)}`,
        {
          method: isFavorite ? 'PUT' : 'DELETE',
          headers
        }
      );

      if (!response.ok) {
        saveLocalAlbumFavorite(albumId, !merged);
      } else {
        lastSyncedAlbumFavorite.set(favoriteKey, merged);
      }
    } catch {
      saveLocalAlbumFavorite(albumId, !merged);
    } finally {
      pendingAlbumFavoriteSyncTimeout.delete(favoriteKey);
    }
  }, 500);

  pendingAlbumFavoriteSyncTimeout.set(favoriteKey, Number(timeoutId));
}

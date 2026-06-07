import type { repertoireListItem, RepertoireSongSearchOption } from '../../types/repertoire';
import { invalidateAccountSummaryCache } from '../account/repository';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';
import { formatDateForUi } from './repository';

export interface repertoireUpdatePayload {
  title?: string;
  description?: string;
  liturgicalType?: string;
  isPublic?: boolean;
  songIds?: string[];
  songs?: Array<{
    songId: string;
    versionId?: string;
  }>;
  coverImageUrl?: string;
  status?: string;
}

export interface repertoireActionResult {
  ok: boolean;
  reason?: 'forbidden' | 'unauthorized' | 'not_found' | 'network' | 'plan_limit' | 'unknown';
  message?: string;
}

const REPERTOIRE_CACHE_TTL_MS = 60_000;
const REPERTOIRE_LIST_CACHE_PREFIX = 'canticum:repertoires:list:v1:';
const REPERTOIRE_DETAIL_CACHE_PREFIX = 'canticum:repertoires:detail:v1:';

interface CacheEnvelope<T> {
  expiresAt: number;
  value: T;
}

function readLocalCache<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(key);
      return null;
    }

    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

function writeLocalCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const envelope: CacheEnvelope<T> = {
      expiresAt: Date.now() + REPERTOIRE_CACHE_TTL_MS,
      value
    };

    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
  }
}

function removeLocalCache(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
  }
}

async function waitForAuthHydration(): Promise<void> {
  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  if (!hasFirebaseConfig) {
    return;
  }

  try {
    const { auth } = await import('../../services/firebase');
    if (auth.currentUser) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        if (unsubscribe) {
          unsubscribe();
        }
        resolve();
      };

      const timeoutId = window.setTimeout(() => {
        finish();
      }, 1500);

      unsubscribe = auth.onAuthStateChanged(() => {
        window.clearTimeout(timeoutId);
        finish();
      });
    });
  } catch {
  }
}

async function getCurrentUserId(): Promise<string> {
  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  if (!hasFirebaseConfig) {
    return 'anonymous';
  }

  try {
    await waitForAuthHydration();
    const { auth } = await import('../../services/firebase');
    return auth.currentUser?.uid ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function mapStatusToReason(status: number): repertoireActionResult['reason'] {
  if (status === 401) {
    return 'unauthorized';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'not_found';
  }

  return 'unknown';
}

async function parsePlanLimitError(response: Response): Promise<repertoireActionResult | null> {
  if (response.status !== 403) {
    return null;
  }

  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code === 'plan_limit') {
      return { ok: false, reason: 'plan_limit', message: body.error.message };
    }
  } catch { /* ignore */ }
  return null;
}

export async function fetchRepertoireDetailClient(repertoireId: string): Promise<Record<string, unknown> | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  const detailCacheKey = `${REPERTOIRE_DETAIL_CACHE_PREFIX}${repertoireId}`;
  const cached = readLocalCache<Record<string, unknown>>(detailCacheKey);
  if (cached) {
    return cached;
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;

    if (payload && typeof payload === 'object') {
      const maybeEnvelope = payload as { repertoire?: unknown };
      if (maybeEnvelope.repertoire && typeof maybeEnvelope.repertoire === 'object') {
        const normalized = maybeEnvelope.repertoire as Record<string, unknown>;
        writeLocalCache(detailCacheKey, normalized);
        return normalized;
      }

      const normalized = payload as Record<string, unknown>;
      writeLocalCache(detailCacheKey, normalized);
      return normalized;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the current user's repertoires from the Cloud Functions endpoint.
 * Uses the Firebase ID token in the Authorization header so that private and
 * draft repertoires owned by the user are returned (the backend filters by uid).
 * Returns null when the request cannot be made (no functions URL configured),
 * and an empty array when the call succeeds but the user has no repertoires.
 */
export async function requestUserRepertoires(): Promise<repertoireListItem[] | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId || userId === 'anonymous') {
      return [];
    }

    const listCacheKey = `${REPERTOIRE_LIST_CACHE_PREFIX}${userId}`;
    const cached = readLocalCache<repertoireListItem[]>(listCacheKey);
    if (cached) {
      return cached;
    }

    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const response = await fetch(
      `${functionsBaseUrl}/repertoires?userId=${encodeURIComponent(userId)}`,
      { method: 'GET', headers, cache: 'no-store' }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const rawList = payload && typeof payload === 'object' && Array.isArray((payload as { repertoires?: unknown }).repertoires)
      ? (payload as { repertoires: unknown[] }).repertoires
      : Array.isArray(payload)
        ? payload
        : [];

    const normalized = rawList
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((raw): repertoireListItem => {
        const songIds = Array.isArray(raw.songIds) ? raw.songIds.filter((id): id is string => typeof id === 'string') : [];
        const status = String(raw.status ?? 'Borrador') === 'Publicado' ? 'Publicado' : 'Borrador';
        const countFromIds = songIds.length;
        return {
          id: String(raw.id ?? ''),
          title: String(raw.title ?? 'repertorio sin título'),
          subtitle: String(raw.subtitle ?? raw.description ?? ''),
          dateLabel: formatDateForUi(raw.dateLabel ?? raw.updatedAt ?? raw.createdAt),
          liturgicalType: String(raw.liturgicalType ?? raw.type ?? 'General'),
          status,
          songsCount: countFromIds > 0 ? countFromIds : Number(raw.songsCount ?? 0),
          sheetsCount: countFromIds > 0 ? countFromIds : Number(raw.sheetsCount ?? 0),
          coverImageUrl: typeof raw.coverImageUrl === 'string' && raw.coverImageUrl.length > 0 ? raw.coverImageUrl : undefined,
          songIds,
          ownerUserId: String(raw.ownerUserId ?? raw.userId ?? userId),
          isPublic: Boolean(raw.isPublic ?? raw.visibility === 'public')
        };
      })
      .filter((item) => item.id.length > 0);

    writeLocalCache(listCacheKey, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function requestDeleterepertoire(repertoireId: string): Promise<repertoireActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildFunctionsHeaders({
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

    removeLocalCache(`${REPERTOIRE_LIST_CACHE_PREFIX}${userId}`);
    removeLocalCache(`${REPERTOIRE_DETAIL_CACHE_PREFIX}${repertoireId}`);
    invalidateAccountSummaryCache();

    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

function isSearchOption(value: unknown): value is RepertoireSongSearchOption {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const option = value as Partial<RepertoireSongSearchOption>;
  return typeof option.songId === 'string' && typeof option.title === 'string';
}

function normalizeSearchOption(raw: Record<string, unknown>): RepertoireSongSearchOption {
  return {
    songId: String(raw.songId ?? ''),
    versionId: typeof raw.versionId === 'string' ? raw.versionId : null,
    title: String(raw.title ?? ''),
    artistName: typeof raw.artistName === 'string' ? raw.artistName : null,
    songArtistName: typeof raw.songArtistName === 'string' ? raw.songArtistName : null,
    versionArtistName: typeof raw.versionArtistName === 'string' ? raw.versionArtistName : null,
    versionName: typeof raw.versionName === 'string' ? raw.versionName : null,
    instrumentName: typeof raw.instrumentName === 'string' ? raw.instrumentName : null,
    matchType: raw.matchType === 'version' ? 'version' : 'song'
  };
}

function extractSearchOptions(payload: unknown): RepertoireSongSearchOption[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => (isSearchOption(entry) ? entry : normalizeSearchOption(entry)))
      .filter((entry) => entry.songId.length > 0 && entry.title.length > 0);
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const envelope = payload as { options?: unknown };
  if (!Array.isArray(envelope.options)) {
    return [];
  }

  return envelope.options
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => (isSearchOption(entry) ? entry : normalizeSearchOption(entry)))
    .filter((entry) => entry.songId.length > 0 && entry.title.length > 0);
}

export async function requestSearchRepertoireSongs(query: string, limit: number = 12): Promise<RepertoireSongSearchOption[]> {
  const q = query.trim();

  if (!q || !functionsBaseUrl) {
    return [];
  }

  try {
    const headers = await buildFunctionsHeaders({
      Accept: 'application/json'
    });

    const response = await fetch(
      `${functionsBaseUrl}/repertoires/song-search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as unknown;
    return extractSearchOptions(payload);
  } catch {
    return [];
  }
}

export async function requestUpdaterepertoire(
  repertoireId: string,
  update: repertoireUpdatePayload,
  options?: { allowStatusUpdate?: boolean }
): Promise<repertoireActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true };
  }

  try {
    const userId = await getCurrentUserId();
    const repertoireUpdate = options?.allowStatusUpdate ? update : { ...update };

    if (!options?.allowStatusUpdate) {
      delete repertoireUpdate.status;
    }

    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ userId, repertoire: repertoireUpdate })
    });

    if (!response.ok) {
      const planErr = await parsePlanLimitError(response);
      if (planErr) return planErr;
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

    removeLocalCache(`${REPERTOIRE_LIST_CACHE_PREFIX}${userId}`);
    removeLocalCache(`${REPERTOIRE_DETAIL_CACHE_PREFIX}${repertoireId}`);
    invalidateAccountSummaryCache();

    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export interface CreaterepertoirePayload {
  title: string;
  repertoireDocId?: string;
  songIds?: string[];
  songs?: Array<{
    songId: string;
    versionId?: string;
  }>;
  isPublic?: boolean;
  liturgicalType?: string;
  coverImageUrl?: string;
}

export async function requestCreaterepertoire(payload: CreaterepertoirePayload): Promise<repertoireActionResult & { repertoireId?: string }> {
  if (!functionsBaseUrl) {
    return { ok: true, repertoireId: `local-${Date.now()}` };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, ...payload })
    });

    if (!response.ok) {
      const planErr = await parsePlanLimitError(response);
      if (planErr) return planErr;
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

    const data = (await response.json()) as { repertoire?: { id?: string } };
    removeLocalCache(`${REPERTOIRE_LIST_CACHE_PREFIX}${userId}`);
    invalidateAccountSummaryCache();
    return { ok: true, repertoireId: data.repertoire?.id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Bookmark functionality for repertoires
const BOOKMARK_CACHE_PREFIX = 'canticum:bookmarks:v1:';
const REMOTE_SYNC_DEBOUNCE_MS = 500;
const bookmarkCache = new Map<string, boolean>();
const pendingBookmarkLoads = new Map<string, Promise<boolean | null>>();
const pendingBookmarkSyncTimeout = new Map<string, number>();
const lastSyncedBookmark = new Map<string, boolean>();

function getBookmarkLocalStorageKey(repertoireId: string): string {
  return `${BOOKMARK_CACHE_PREFIX}${repertoireId}`;
}

function readLocalBookmark(repertoireId: string): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getBookmarkLocalStorageKey(repertoireId));
    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}

function saveLocalBookmark(repertoireId: string, isBookmarked: boolean): boolean {
  if (typeof window === 'undefined') {
    return isBookmarked;
  }

  try {
    window.localStorage.setItem(getBookmarkLocalStorageKey(repertoireId), JSON.stringify(isBookmarked));
    bookmarkCache.set(repertoireId, isBookmarked);
    return isBookmarked;
  } catch {
    return isBookmarked;
  }
}

export async function loadRepertoireBookmark(repertoireId: string): Promise<boolean | null> {
  const cached = bookmarkCache.get(repertoireId);
  if (typeof cached === 'boolean') {
    return cached;
  }

  const inflight = pendingBookmarkLoads.get(repertoireId);
  if (inflight) {
    return inflight;
  }

  const local = readLocalBookmark(repertoireId);
  if (typeof local === 'boolean') {
    bookmarkCache.set(repertoireId, local);
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
      const response = await fetch(`${functionsBaseUrl}/users/${encodeURIComponent(userId)}/bookmarks/${encodeURIComponent(repertoireId)}`, {
        method: 'GET',
        headers
      });

      if (response.status === 404) {
        return saveLocalBookmark(repertoireId, false);
      }

      if (!response.ok) {
        return local;
      }

      const payload = (await response.json()) as { isBookmarked?: boolean };
      const remoteBookmarked = payload.isBookmarked;

      if (typeof remoteBookmarked !== 'boolean') {
        return local;
      }

      return saveLocalBookmark(repertoireId, remoteBookmarked);
    } catch {
      return local;
    } finally {
      pendingBookmarkLoads.delete(repertoireId);
    }
  })();

  pendingBookmarkLoads.set(repertoireId, task);
  return task;
}

export async function saveRepertoireBookmark(repertoireId: string, isBookmarked: boolean): Promise<void> {
  const cached = bookmarkCache.get(repertoireId);
  const merged = saveLocalBookmark(repertoireId, isBookmarked);

  if (cached === merged) {
    return;
  }

  if (!functionsBaseUrl) {
    return;
  }

  const existingTimeout = pendingBookmarkSyncTimeout.get(repertoireId);
  if (typeof existingTimeout === 'number') {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(async () => {
    pendingBookmarkSyncTimeout.delete(repertoireId);

    try {
      const userId = await getCurrentUserId();
      if (userId === 'anonymous') {
        return;
      }

      if (lastSyncedBookmark.get(repertoireId) === merged) {
        return;
      }

      const headers = await buildFunctionsHeaders({
        'Content-Type': 'application/json'
      });

      const response = await fetch(
        `${functionsBaseUrl}/users/${encodeURIComponent(userId)}/bookmarks/${encodeURIComponent(repertoireId)}`,
        {
          method: merged ? 'PUT' : 'DELETE',
          headers
        }
      );

      if (response.ok) {
        lastSyncedBookmark.set(repertoireId, merged);
      }
    } catch {
      return;
    }
  }, REMOTE_SYNC_DEBOUNCE_MS);

  pendingBookmarkSyncTimeout.set(repertoireId, timeoutId);
}

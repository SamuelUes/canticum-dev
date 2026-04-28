import type { repertoireListItem, RepertoireSongSearchOption } from '../../types/repertoire';

export interface repertoireUpdatePayload {
  title?: string;
  description?: string;
  liturgicalType?: string;
  isPublic?: boolean;
}

export interface repertoireActionResult {
  ok: boolean;
  reason?: 'forbidden' | 'unauthorized' | 'not_found' | 'network' | 'plan_limit' | 'unknown';
  message?: string;
}

const functionsBaseUrl = (process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

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

  try {
    const headers = await buildAuthHeaders({ Accept: 'application/json' });
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
        return maybeEnvelope.repertoire as Record<string, unknown>;
      }
      return payload as Record<string, unknown>;
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

    const headers = await buildAuthHeaders({ Accept: 'application/json' });
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

    return rawList
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((raw): repertoireListItem => {
        const songIds = Array.isArray(raw.songIds) ? raw.songIds.filter((id): id is string => typeof id === 'string') : [];
        const status = String(raw.status ?? 'Borrador') === 'Publicado' ? 'Publicado' : 'Borrador';
        const countFromIds = songIds.length;
        return {
          id: String(raw.id ?? ''),
          title: String(raw.title ?? 'repertorio sin título'),
          subtitle: String(raw.subtitle ?? raw.description ?? ''),
          dateLabel: typeof raw.dateLabel === 'string' && raw.dateLabel
            ? raw.dateLabel
            : typeof raw.updatedAt === 'string'
              ? raw.updatedAt
              : typeof raw.createdAt === 'string'
                ? raw.createdAt
                : 'N/D',
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
    const headers = await buildAuthHeaders({
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

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
    const headers = await buildAuthHeaders({
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

export async function requestUpdaterepertoire(repertoireId: string, update: repertoireUpdatePayload): Promise<repertoireActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ userId, repertoire: update })
    });

    if (!response.ok) {
      const planErr = await parsePlanLimitError(response);
      if (planErr) return planErr;
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export interface CreaterepertoirePayload {
  title: string;
  songIds?: string[];
  songs?: Array<{
    songId: string;
    versionId?: string;
  }>;
  isPublic?: boolean;
  liturgicalType?: string;
}

export async function requestCreaterepertoire(payload: CreaterepertoirePayload): Promise<repertoireActionResult & { repertoireId?: string }> {
  if (!functionsBaseUrl) {
    return { ok: true, repertoireId: `local-${Date.now()}` };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
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
    return { ok: true, repertoireId: data.repertoire?.id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

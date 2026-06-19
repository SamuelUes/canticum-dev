import { readClientCache, removeClientCacheByPrefix, writeClientCache } from '../shared/clientCache';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';

const ACCOUNT_SUMMARY_CACHE_PREFIX = 'canticum:account:summary:v1:';
const ACCOUNT_SUMMARY_CACHE_TTL_MS = 45_000;

export type AccountSongSummary = {
  id: string;
  sqlSongId?: number | null;
  title: string;
  subtitle?: string;
  status: string;
  coverImageUrl?: string;
  updatedAt?: string | null;
};

export type AccountrepertoireSummary = {
  id: string;
  title: string;
  subtitle?: string;
  status: string;
  isPublic: boolean;
  coverImageUrl?: string;
  updatedAt?: string | null;
};

export type AccountSummaryProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  plan: string;
  premium: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AccountSummary = {
  ok: boolean;
  userId: string;
  profile: AccountSummaryProfile;
  stats: {
    songs: {
      firestore: Record<string, number>;
      cloudSql: Record<string, number>;
    };
    repertoires: Record<string, number>;
  };
  firestore: {
    songs: AccountSongSummary[];
    repertoires: AccountrepertoireSummary[];
  };
  cloudSql: {
    songs: Array<{ status: string; total: number }>;
    fetchedAt?: string;
  };
};

function isAccountSummary(value: unknown): value is AccountSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return Boolean(payload.ok && payload.profile && payload.stats && payload.firestore);
}

export async function fetchAccountSummary(userId?: string): Promise<AccountSummary | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  const cacheKey = `${ACCOUNT_SUMMARY_CACHE_PREFIX}${userId ?? 'self'}`;
  const cached = readClientCache<AccountSummary>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    if (!headers.Authorization) {
      throw new Error('Debes iniciar sesión para ver tu cuenta.');
    }

    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`${functionsBaseUrl}/account${qs}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      const reason = response.status === 401
        ? 'Debes iniciar sesión para ver tu cuenta.'
        : response.status === 403
          ? 'No tienes permiso para ver esta cuenta.'
          : 'No se pudo cargar la cuenta.';
      throw new Error(reason);
    }

    const payload = (await response.json()) as unknown;
    if (isAccountSummary(payload)) {
      writeClientCache(cacheKey, payload, ACCOUNT_SUMMARY_CACHE_TTL_MS);
      return payload;
    }

    return null;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('No se pudo cargar la cuenta.');
  }
}

export function invalidateAccountSummaryCache(): void {
  removeClientCacheByPrefix(ACCOUNT_SUMMARY_CACHE_PREFIX);
}

export async function softDeleteAccount(): Promise<void> {
  if (!functionsBaseUrl) {
    throw new Error('Functions base URL not configured.');
  }

  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  if (!headers.Authorization) {
    throw new Error('Debes iniciar sesión para eliminar tu cuenta.');
  }

  const response = await fetch(`${functionsBaseUrl}/account`, {
    method: 'DELETE',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const reason = response.status === 401
      ? 'Debes iniciar sesión para eliminar tu cuenta.'
      : response.status === 403
        ? 'No tienes permiso para eliminar esta cuenta.'
        : 'No se pudo eliminar la cuenta.';
    throw new Error(reason);
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload === 'object' && payload !== null && 'ok' in payload && payload.ok === true) {
    return;
  }

  throw new Error('No se pudo eliminar la cuenta.');
}

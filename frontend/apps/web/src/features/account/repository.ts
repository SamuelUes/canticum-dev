import { readClientCache, removeClientCacheByPrefix, writeClientCache } from '../shared/clientCache';

const functionsBaseUrl = [
  process.env.GCP_FUNCTIONS_BASE_URL,
  process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL
]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find((value) => value.length > 0)?.replace(/\/$/, '') ?? '';

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
    const headers = await buildAuthHeaders({ Accept: 'application/json' });
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

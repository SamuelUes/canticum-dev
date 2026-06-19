const rawFunctionsBaseUrl = [
  process.env.GCP_FUNCTIONS_BASE_URL,
  process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL
]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find((value) => value.length > 0) ?? '';

export const functionsBaseUrl = rawFunctionsBaseUrl.replace(/\/$/, '');

export function isFunctionsConfigured(): boolean {
  return functionsBaseUrl.length > 0;
}

export function shouldUseMockFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function getClientAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const hasFirebaseConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!hasFirebaseConfig) {
    return null;
  }

  try {
    const { auth } = await import('../../services/firebase');
    if (!auth?.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function buildFunctionsHeaders(baseHeaders: Record<string, string>): Promise<Record<string, string>> {
  const clientToken = await getClientAuthToken();
  if (clientToken) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${clientToken}`
    };
  }

  return baseHeaders;
}

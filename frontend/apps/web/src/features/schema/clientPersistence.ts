export interface SchemaUpdatePayload {
  title?: string;
  description?: string;
  liturgicalType?: string;
  isPublic?: boolean;
}

export interface SchemaActionResult {
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

function mapStatusToReason(status: number): SchemaActionResult['reason'] {
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

async function parsePlanLimitError(response: Response): Promise<SchemaActionResult | null> {
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

export async function requestDeleteSchema(schemaId: string): Promise<SchemaActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/schemas/${schemaId}?userId=${encodeURIComponent(userId)}`, {
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

export async function requestUpdateSchema(schemaId: string, update: SchemaUpdatePayload): Promise<SchemaActionResult> {
  if (!functionsBaseUrl) {
    return { ok: true };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/schemas/${schemaId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ userId, schema: update })
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

export interface CreateSchemaPayload {
  title: string;
  songIds?: string[];
  isPublic?: boolean;
  liturgicalType?: string;
}

export async function requestCreateSchema(payload: CreateSchemaPayload): Promise<SchemaActionResult & { schemaId?: string }> {
  if (!functionsBaseUrl) {
    return { ok: true, schemaId: `local-${Date.now()}` };
  }

  try {
    const userId = await getCurrentUserId();
    const headers = await buildAuthHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/schemas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, ...payload })
    });

    if (!response.ok) {
      const planErr = await parsePlanLimitError(response);
      if (planErr) return planErr;
      return { ok: false, reason: mapStatusToReason(response.status) };
    }

    const data = (await response.json()) as { schema?: { id?: string } };
    return { ok: true, schemaId: data.schema?.id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

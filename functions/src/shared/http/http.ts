import * as functions from 'firebase-functions/v1';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

export interface RequestAuthContext {
  uid: string;
  token: DecodedIdToken;
}

const DEFAULT_ALLOWED_HEADERS = ['authorization', 'content-type', 'accept', 'cache-control'];

function buildAllowedHeaders(res: functions.Response): string {
  const requested = String(res.req?.get('Access-Control-Request-Headers') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  const merged = new Set<string>(DEFAULT_ALLOWED_HEADERS);
  requested.forEach((header) => merged.add(header));
  return Array.from(merged).join(', ');
}

export function applyCors(res: functions.Response): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Vary', 'Origin, Access-Control-Request-Headers');
  res.set('Access-Control-Allow-Headers', buildAllowedHeaders(res));
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

export function handlePreflight(req: functions.https.Request, res: functions.Response): boolean {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

export function sendJson(res: functions.Response, status: number, payload: unknown): void {
  applyCors(res);
  res.status(status).json(payload);
}

export function sendError(res: functions.Response, status: number, code: string, message: string): void {
  sendJson(res, status, {
    error: {
      code,
      message
    }
  });
}

export function getPathSegments(req: functions.https.Request): string[] {
  return req.path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function getBodyRecord(req: functions.https.Request): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }

  return {};
}

export function getBodyString(req: functions.https.Request, key: string): string | undefined {
  const value = getBodyRecord(req)[key];
  return typeof value === 'string' ? value : undefined;
}

export function getQueryString(req: functions.https.Request, key: string): string | undefined {
  const value = req.query[key];

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

export async function getOptionalAuthContext(req: functions.https.Request): Promise<RequestAuthContext | null> {
  const authorization = req.get('Authorization') ?? req.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    return null;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      token: decoded
    };
  } catch {
    return null;
  }
}

export function resolveRequestUserId(req: functions.https.Request, authContext: RequestAuthContext | null): string | null {
  const bodyUserId = getBodyString(req, 'userId');
  const queryUserId = getQueryString(req, 'userId');

  return authContext?.uid ?? bodyUserId ?? queryUserId ?? null;
}

export function getAuthContext(req: functions.https.Request): RequestAuthContext | null {
  const authorization = req.get('Authorization') ?? req.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    return null;
  }

  // For synchronous operations, we need to verify the token synchronously
  // This is a simplified version - in production you might want to use async version
  try {
    // Note: This is a simplified sync version. In production, consider using getOptionalAuthContext
    // and handling async properly in your handlers
    const auth = getAuth();
    // For now, return null and let handlers use async verification
    return null;
  } catch {
    return null;
  }
}

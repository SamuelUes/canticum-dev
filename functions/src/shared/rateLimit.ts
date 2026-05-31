import { Timestamp } from 'firebase-admin/firestore';
import type * as functions from 'firebase-functions/v1';
import { getAppFirestore } from './firestore';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function applyRateLimitHeaders(
  res: functions.Response,
  limit: number,
  result: RateLimitResult
): void {
  res.set('X-RateLimit-Limit', String(Math.max(1, Math.floor(limit))));
  res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
  res.set('X-RateLimit-Reset', String(result.retryAfterSeconds));
}

function sanitizeSegment(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9._:-]+/g, '_');
  return compact.length > 0 ? compact : 'unknown';
}

function buildLimiterDocId(identifier: string, action: string): string {
  return `${sanitizeSegment(action)}::${sanitizeSegment(identifier)}`;
}

export async function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!identifier.trim() || !action.trim()) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, windowSeconds) };
  }

  const normalizedMax = Number.isFinite(maxRequests) && maxRequests > 0 ? Math.floor(maxRequests) : 1;
  const normalizedWindowSeconds = Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.floor(windowSeconds) : 60;

  const now = Date.now();
  const windowMs = normalizedWindowSeconds * 1000;
  const limiterRef = getAppFirestore()
    .collection('_rate_limits')
    .doc(buildLimiterDocId(identifier, action));

  return getAppFirestore().runTransaction(async (transaction) => {
    const snap = await transaction.get(limiterRef);

    const currentCount = snap.exists ? Number(snap.get('count') ?? 0) : 0;
    const currentWindowStartMs = snap.exists ? Number(snap.get('windowStartMs') ?? 0) : 0;
    const windowExpired = currentWindowStartMs <= 0 || now - currentWindowStartMs >= windowMs;

    const nextWindowStartMs = windowExpired ? now : currentWindowStartMs;
    const nextCount = windowExpired ? 1 : currentCount + 1;

    const isAllowed = nextCount <= normalizedMax;
    const remaining = isAllowed ? Math.max(0, normalizedMax - nextCount) : 0;
    const retryAfterMs = Math.max(0, nextWindowStartMs + windowMs - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    transaction.set(limiterRef, {
      action,
      identifier,
      count: nextCount,
      windowStartMs: nextWindowStartMs,
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(nextWindowStartMs + windowMs)
    }, { merge: true });

    return {
      allowed: isAllowed,
      remaining,
      retryAfterSeconds
    };
  });
}

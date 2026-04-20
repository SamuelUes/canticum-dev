import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';

/* ── Free-plan caps ── */
export const FREE_MAX_SCHEMAS = 2;
export const FREE_MAX_SONGS_PER_SCHEMA = 10;
export const FREE_MAX_FAVORITES = 10;

/* ── Helpers ── */

export function isPremiumUser(token: DecodedIdToken | null | undefined): boolean {
  return Boolean(token?.premium);
}

export async function isPremiumByUid(uid: string): Promise<boolean> {
  const userSnap = await getFirestore().collection('users').doc(uid).get();
  const data = (userSnap.data() ?? {}) as Record<string, unknown>;
  return Boolean(data.premium);
}

/**
 * Resolve premium status from token claims first, falling back to Firestore.
 */
export async function resolveIsPremium(uid: string, token: DecodedIdToken | null | undefined): Promise<boolean> {
  if (isPremiumUser(token)) {
    return true;
  }
  return isPremiumByUid(uid);
}

/**
 * Count how many schemas the user currently owns.
 */
export async function countUserSchemas(uid: string): Promise<number> {
  const snap = await getFirestore()
    .collection('schemas')
    .where('userId', '==', uid)
    .count()
    .get();
  return snap.data().count;
}

/**
 * Count how many favorites the user currently has.
 */
export async function countUserFavorites(uid: string): Promise<number> {
  const snap = await getFirestore()
    .collection('users')
    .doc(uid)
    .collection('favorites')
    .count()
    .get();
  return snap.data().count;
}

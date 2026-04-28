import { getAppFirestore } from '../firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';

/* ── Free-plan caps ── */
export const FREE_MAX_repertoireS = 2;
export const FREE_MAX_SONGS_PER_repertoire = 10;
export const FREE_MAX_FAVORITES = 10;

/* ── Helpers ── */

export function isPremiumUser(token: DecodedIdToken | null | undefined): boolean {
  return Boolean(token?.premium);
}

export async function isPremiumByUid(uid: string): Promise<boolean> {
  const userSnap = await getAppFirestore().collection('users').doc(uid).get();
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
 * Count how many repertoires the user currently owns.
 */
export async function countUserrepertoires(uid: string): Promise<number> {
  const snap = await getAppFirestore()
    .collection('repertoires')
    .where('userId', '==', uid)
    .count()
    .get();
  return snap.data().count;
}

/**
 * Count how many favorites the user currently has.
 */
export async function countUserFavorites(uid: string): Promise<number> {
  try {
    const snap = await getAppFirestore()
      .collectionGroup('versions')
      .where('userId', '==', uid)
      .count()
      .get();
    return snap.data().count;
  } catch {
    const favoriteSongsSnap = await getAppFirestore()
      .collection('users')
      .doc(uid)
      .collection('favorites')
      .get();

    if (favoriteSongsSnap.empty) {
      return 0;
    }

    const countTasks = favoriteSongsSnap.docs.map(async (favoriteSongDoc) => {
      const versionCountSnap = await favoriteSongDoc.ref.collection('versions').count().get();
      return versionCountSnap.data().count;
    });

    const counts = await Promise.all(countTasks);
    return counts.reduce((total, current) => total + current, 0);
  }
}

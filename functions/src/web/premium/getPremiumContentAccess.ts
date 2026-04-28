import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';

interface PremiumAccessPayload {
  songId?: string;
}

export const getPremiumContentAccess = functions.https.onCall(async (data: PremiumAccessPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const uid = context.auth.uid;
  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
  const isPremiumClaim = Boolean(context.auth.token.premium);

  if (!songId) {
    return {
      ok: true,
      uid,
      isPremiumUser: isPremiumClaim,
      hasSongUnlock: false,
      canAccessPremium: isPremiumClaim
    };
  }

  const unlockSnap = await getAppFirestore().collection('users').doc(uid).collection('songUnlocks').doc(songId).get();
  const hasSongUnlock = unlockSnap.exists;

  return {
    ok: true,
    uid,
    songId,
    isPremiumUser: isPremiumClaim,
    hasSongUnlock,
    canAccessPremium: isPremiumClaim || hasSongUnlock
  };
});

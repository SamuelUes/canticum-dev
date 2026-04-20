import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import { FREE_MAX_FAVORITES, countUserFavorites, isPremiumUser } from '../../shared/plan/planLimits';

interface ToggleFavoritePayload {
  songId: string;
  isFavorite: boolean;
}

export const toggleFavorite = functions.https.onCall(async (data: ToggleFavoritePayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';

  if (!songId) {
    throw new functions.https.HttpsError('invalid-argument', 'songId is required.');
  }

  const uid = context.auth.uid;
  const favoriteRef = getFirestore().collection('users').doc(uid).collection('favorites').doc(songId);

  if (Boolean(data?.isFavorite)) {
    if (!isPremiumUser(context.auth.token)) {
      const alreadyExists = (await favoriteRef.get()).exists;
      if (!alreadyExists) {
        const currentCount = await countUserFavorites(uid);
        if (currentCount >= FREE_MAX_FAVORITES) {
          throw new functions.https.HttpsError(
            'permission-denied',
            `El plan Free permite hasta ${FREE_MAX_FAVORITES} favoritos. Actualiza a Premium para agregar m\u00e1s.`
          );
        }
      }
    }

    await favoriteRef.set(
      {
        songId,
        isFavorite: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } else {
    await favoriteRef.delete();
  }

  return {
    ok: true,
    songId,
    isFavorite: Boolean(data?.isFavorite)
  };
});

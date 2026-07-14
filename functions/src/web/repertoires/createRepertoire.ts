import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { FREE_MAX_repertoireS, FREE_MAX_SONGS_PER_repertoire, countUserrepertoires, resolveIsPremium } from '../../shared/plan/planLimits';
import { capitalizeFirstLetter } from '../../shared/validation';

interface CreaterepertoirePayload {
  title: string;
  description?: string;
  liturgicalType?: string;
  isPublic?: boolean;
  songIds?: string[];
}

export const createRepertoire = functions.https.onCall(async (data: CreaterepertoirePayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const title = typeof data?.title === 'string' ? capitalizeFirstLetter(data.title.trim()) : '';

  if (!title) {
    throw new functions.https.HttpsError('invalid-argument', 'title is required.');
  }

  const songIds = Array.isArray(data.songIds)
    ? data.songIds.filter((songId): songId is string => typeof songId === 'string' && songId.trim().length > 0)
    : [];

  const uid = context.auth.uid;
  const isPublic = Boolean(data.isPublic);

  const premium = await resolveIsPremium(uid, context.auth.token);

  if (!premium) {
    const repertoireCount = await countUserrepertoires(uid);

    if (repertoireCount >= FREE_MAX_repertoireS) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `El plan Free permite hasta ${FREE_MAX_repertoireS} repertorios. Actualiza a Premium para crear más.`
      );
    }

    if (songIds.length > FREE_MAX_SONGS_PER_repertoire) {
      throw new functions.https.HttpsError(
        'permission-denied',
        `El plan Free permite hasta ${FREE_MAX_SONGS_PER_repertoire} canciones por repertorio. Actualiza a Premium para agregar más.`
      );
    }
  }

  const repertoireRef = getAppFirestore().collection('repertoires').doc();

  await repertoireRef.set({
    userId: uid,
    ownerUserId: uid,
    createdBy: uid,
    title,
    description: typeof data.description === 'string' ? data.description : '',
    liturgicalType: typeof data.liturgicalType === 'string' ? data.liturgicalType : 'General',
    type: typeof data.liturgicalType === 'string' ? data.liturgicalType : 'General',
    isPublic,
    visibility: isPublic ? 'public' : 'private',
    songIds,
    songsCount: songIds.length,
    sheetsCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    repertoireId: repertoireRef.id
  };
});

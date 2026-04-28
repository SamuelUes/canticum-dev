import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { FREE_MAX_SONGS_PER_repertoire, resolveIsPremium } from '../../shared/plan/planLimits';

interface ReorderrepertoireSongsPayload {
  repertoireId: string;
  songIds: string[];
}

export const reorderRepertoireSongs = functions.https.onCall(async (data: ReorderrepertoireSongsPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const repertoireId = typeof data?.repertoireId === 'string' ? data.repertoireId.trim() : '';
  const songIds = Array.isArray(data?.songIds)
    ? data.songIds.filter((songId): songId is string => typeof songId === 'string' && songId.trim().length > 0)
    : [];

  if (!repertoireId) {
    throw new functions.https.HttpsError('invalid-argument', 'repertoireId is required.');
  }

  const repertoireRef = getAppFirestore().collection('repertoires').doc(repertoireId);
  const repertoireSnap = await repertoireRef.get();

  if (!repertoireSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'repertoire not found.');
  }

  const repertoireData = (repertoireSnap.data() ?? {}) as Record<string, unknown>;
  const ownerUserId = String(repertoireData.userId ?? repertoireData.ownerUserId ?? '');

  if (context.auth.token.role !== 'admin' && ownerUserId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can reorder repertoire songs.');
  }

  const premium = await resolveIsPremium(context.auth.uid, context.auth.token);
  if (!premium && songIds.length > FREE_MAX_SONGS_PER_repertoire) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `El plan Free permite hasta ${FREE_MAX_SONGS_PER_repertoire} canciones por repertorio. Actualiza a Premium para agregar más.`
    );
  }

  await repertoireRef.set(
    {
      songIds,
      songsCount: songIds.length,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    repertoireId,
    songsCount: songIds.length
  };
});

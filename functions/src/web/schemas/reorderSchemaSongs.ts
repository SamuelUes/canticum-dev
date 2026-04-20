import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

interface ReorderSchemaSongsPayload {
  schemaId: string;
  songIds: string[];
}

export const reorderSchemaSongs = functions.https.onCall(async (data: ReorderSchemaSongsPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const schemaId = typeof data?.schemaId === 'string' ? data.schemaId.trim() : '';
  const songIds = Array.isArray(data?.songIds)
    ? data.songIds.filter((songId): songId is string => typeof songId === 'string' && songId.trim().length > 0)
    : [];

  if (!schemaId) {
    throw new functions.https.HttpsError('invalid-argument', 'schemaId is required.');
  }

  const schemaRef = getFirestore().collection('schemas').doc(schemaId);
  const schemaSnap = await schemaRef.get();

  if (!schemaSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Schema not found.');
  }

  const schemaData = (schemaSnap.data() ?? {}) as Record<string, unknown>;
  const ownerUserId = String(schemaData.userId ?? schemaData.ownerUserId ?? '');

  if (context.auth.token.role !== 'admin' && ownerUserId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can reorder schema songs.');
  }

  await schemaRef.set(
    {
      songIds,
      songsCount: songIds.length,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    schemaId,
    songsCount: songIds.length
  };
});

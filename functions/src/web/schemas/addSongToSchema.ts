import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

interface AddSongToSchemaPayload {
  schemaId: string;
  songId: string;
}

export const addSongToSchema = functions.https.onCall(async (data: AddSongToSchemaPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const schemaId = typeof data?.schemaId === 'string' ? data.schemaId.trim() : '';
  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';

  if (!schemaId || !songId) {
    throw new functions.https.HttpsError('invalid-argument', 'schemaId and songId are required.');
  }

  const db = getFirestore();
  const schemaRef = db.collection('schemas').doc(schemaId);
  const schemaSnap = await schemaRef.get();

  if (!schemaSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Schema not found.');
  }

  const schemaData = (schemaSnap.data() ?? {}) as Record<string, unknown>;
  const ownerUserId = String(schemaData.userId ?? schemaData.ownerUserId ?? '');

  if (context.auth.token.role !== 'admin' && ownerUserId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can update schema songs.');
  }

  const songIds = Array.isArray(schemaData.songIds)
    ? schemaData.songIds.map((value) => String(value))
    : [];

  if (!songIds.includes(songId)) {
    songIds.push(songId);
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

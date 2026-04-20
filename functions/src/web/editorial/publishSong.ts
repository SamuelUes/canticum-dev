import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

interface PublishSongPayload {
  songId: string;
  note?: string;
}

function canPublish(role?: string): boolean {
  return role === 'admin' || role === 'publisher';
}

export const publishSong = functions.https.onCall(async (data: PublishSongPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canPublish(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Publisher or admin role required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';

  if (!songId) {
    throw new functions.https.HttpsError('invalid-argument', 'songId is required.');
  }

  const songRef = getFirestore().collection('songs').doc(songId);
  const songSnap = await songRef.get();

  if (!songSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Song not found.');
  }

  const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
  const status = String(songData.status ?? '').toUpperCase();

  if (status !== 'APPROVED') {
    throw new functions.https.HttpsError('failed-precondition', 'Only APPROVED songs can be published.');
  }

  await songRef.set(
    {
      status: 'PUBLISHED',
      publishedAt: FieldValue.serverTimestamp(),
      publishedBy: context.auth.uid,
      publicationNote: typeof data.note === 'string' ? data.note : '',
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    songId,
    status: 'PUBLISHED'
  };
});

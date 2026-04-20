import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

interface ApproveSongPayload {
  songId: string;
  note?: string;
}

function canApprove(role?: string): boolean {
  return role === 'admin' || role === 'curador' || role === 'curator';
}

export const approveSong = functions.https.onCall(async (data: ApproveSongPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canApprove(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Curator or admin role required.');
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

  if (status !== 'IN_REVIEW') {
    throw new functions.https.HttpsError('failed-precondition', 'Only songs in IN_REVIEW can be approved.');
  }

  await songRef.set(
    {
      status: 'APPROVED',
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: context.auth.uid,
      reviewNotes: typeof data.note === 'string' ? data.note : songData.reviewNotes ?? '',
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    songId,
    status: 'APPROVED'
  };
});

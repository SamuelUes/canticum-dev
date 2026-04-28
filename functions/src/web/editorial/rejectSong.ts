import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';

interface RejectSongPayload {
  songId: string;
  note?: string;
}

function canReject(role?: string): boolean {
  return role === 'admin' || role === 'curador' || role === 'curator';
}

export const rejectSong = functions.https.onCall(async (data: RejectSongPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canReject(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Curator or admin role required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
  const note = typeof data?.note === 'string' ? data.note.trim() : '';

  if (!songId) {
    throw new functions.https.HttpsError('invalid-argument', 'songId is required.');
  }

  if (!note) {
    throw new functions.https.HttpsError('invalid-argument', 'note is required when rejecting a song.');
  }

  const songRef = getAppFirestore().collection('songs').doc(songId);
  const songSnap = await songRef.get();

  if (!songSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Song not found.');
  }

  const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
  const status = String(songData.status ?? '').toUpperCase();

  if (status !== 'IN_REVIEW' && status !== 'APPROVED') {
    throw new functions.https.HttpsError('failed-precondition', 'Song must be in IN_REVIEW or APPROVED to reject it.');
  }

  await songRef.set(
    {
      status: 'REJECTED',
      rejectedAt: FieldValue.serverTimestamp(),
      rejectedBy: context.auth.uid,
      reviewNotes: note,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    songId,
    status: 'REJECTED'
  };
});

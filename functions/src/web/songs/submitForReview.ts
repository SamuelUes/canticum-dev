import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';

interface SubmitForReviewPayload {
  songId: string;
  note?: string;
}

function canSubmit(role?: string): boolean {
  return role === 'admin' || role === 'editor' || role === 'user' || role === 'artist';
}

export const submitForReview = functions.https.onCall(async (data: SubmitForReviewPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canSubmit(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Current role cannot submit songs for review.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';

  if (!songId) {
    throw new functions.https.HttpsError('invalid-argument', 'songId is required.');
  }

  const songRef = getAppFirestore().collection('songs').doc(songId);
  const songSnap = await songRef.get();

  if (!songSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Song not found.');
  }

  const song = (songSnap.data() ?? {}) as Record<string, unknown>;
  const ownerUserId = typeof song.ownerUserId === 'string' ? song.ownerUserId : String(song.createdBy ?? '');

  if (role !== 'admin' && ownerUserId && ownerUserId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only owner can submit this song.');
  }

  const status = String(song.status ?? 'DRAFT').toUpperCase();
  const canMoveToReview = status === 'DRAFT' || status === 'UPLOADED' || status === 'REJECTED';

  if (!canMoveToReview) {
    throw new functions.https.HttpsError('failed-precondition', `Song in status ${status} cannot be submitted.`);
  }

  const versionCountSnap = await songRef.collection('versions').limit(1).get();

  if (versionCountSnap.empty) {
    throw new functions.https.HttpsError('failed-precondition', 'At least one version is required before review.');
  }

  await songRef.set(
    {
      status: 'IN_REVIEW',
      reviewNotes: typeof data.note === 'string' ? data.note : '',
      submittedForReviewAt: FieldValue.serverTimestamp(),
      submittedBy: context.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    ok: true,
    songId,
    status: 'IN_REVIEW'
  };
});

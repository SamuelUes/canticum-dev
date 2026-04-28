import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';

interface AddSongVersionPayload {
  songId: string;
  versionName: string;
  artistName?: string;
  artistId?: string;
  instrumentId?: string;
  instrumentName?: string;
  tone?: string;
  notationType?: string;
  audioReferenceUrl?: string;
  isPremium?: boolean;
  label?: string;
}

function canEdit(role?: string): boolean {
  return role === 'admin' || role === 'editor';
}

export const addSongVersion = functions.https.onCall(async (data: AddSongVersionPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canEdit(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Editor or admin role required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
  const versionName = typeof data?.versionName === 'string' ? data.versionName.trim() : '';

  if (!songId || !versionName) {
    throw new functions.https.HttpsError('invalid-argument', 'songId and versionName are required.');
  }

  const songRef = getAppFirestore().collection('songs').doc(songId);
  const songSnap = await songRef.get();

  if (!songSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Song not found.');
  }

  const existingVersionsSnap = await songRef.collection('versions').limit(1).get();
  const isFirstVersion = existingVersionsSnap.empty;

  const versionRef = songRef.collection('versions').doc();

  await versionRef.set({
    songId,
    versionId: versionRef.id,
    versionName,
    artistName: typeof data.artistName === 'string' ? data.artistName : '',
    artistId: typeof data.artistId === 'string' ? data.artistId : null,
    instrumentId: typeof data.instrumentId === 'string' ? data.instrumentId : null,
    instrumentName: typeof data.instrumentName === 'string' ? data.instrumentName : null,
    tone: typeof data.tone === 'string' ? data.tone : null,
    notationType: typeof data.notationType === 'string' ? data.notationType : 'chords',
    audioReferenceUrl: typeof data.audioReferenceUrl === 'string' ? data.audioReferenceUrl : null,
    isPremium: Boolean(data.isPremium),
    label: typeof data.label === 'string' ? data.label : versionName,
    createdBy: context.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  const songUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (isFirstVersion) {
    songUpdate.currentVersionId = versionRef.id;
  }

  await songRef.set(songUpdate, { merge: true });

  return {
    ok: true,
    songId,
    versionId: versionRef.id
  };
});

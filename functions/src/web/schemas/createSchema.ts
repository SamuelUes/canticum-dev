import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

interface CreateSchemaPayload {
  title: string;
  description?: string;
  liturgicalType?: string;
  isPublic?: boolean;
  songIds?: string[];
}

export const createSchema = functions.https.onCall(async (data: CreateSchemaPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const title = typeof data?.title === 'string' ? data.title.trim() : '';

  if (!title) {
    throw new functions.https.HttpsError('invalid-argument', 'title is required.');
  }

  const songIds = Array.isArray(data.songIds)
    ? data.songIds.filter((songId): songId is string => typeof songId === 'string' && songId.trim().length > 0)
    : [];

  const uid = context.auth.uid;
  const isPublic = Boolean(data.isPublic);
  const schemaRef = getFirestore().collection('schemas').doc();

  await schemaRef.set({
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
    schemaId: schemaRef.id
  };
});

import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';

interface CreateSongDraftPayload {
  title: string;
  author?: string;
  year?: number;
  lyrics?: string;
  liturgicalType?: string;
  canPurchaseIndividually?: boolean;
  individualPriceUsd?: number;
}

function normalizeTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const createSongDraft = functions.https.onCall(async (data: CreateSongDraftPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const title = normalizeTitle(data?.title);

  if (!title) {
    throw new functions.https.HttpsError('invalid-argument', 'title is required.');
  }

  const uid = context.auth.uid;
  const songRef = getAppFirestore().collection('songs').doc();

  await songRef.set({
    title,
    author: typeof data.author === 'string' ? data.author : '',
    year: typeof data.year === 'number' ? data.year : null,
    lyrics: typeof data.lyrics === 'string' ? data.lyrics : '',
    liturgicalType: typeof data.liturgicalType === 'string' ? data.liturgicalType : 'General',
    status: 'DRAFT',
    createdBy: uid,
    ownerUserId: uid,
    canPurchaseIndividually: Boolean(data?.canPurchaseIndividually),
    individualPriceUsd: typeof data?.individualPriceUsd === 'number' ? data.individualPriceUsd : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    songId: songRef.id,
    status: 'DRAFT'
  };
});

import * as functions from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import '../firebaseAdmin';

interface SetUserClaimsPayload {
  uid: string;
  role?: string;
  premium?: boolean;
}

export const setUserClaims = functions.https.onCall(async (data: SetUserClaimsPayload, context) => {
  const auth = context.auth;

  if (!auth || auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admin can assign custom claims.');
  }

  if (!data || !data.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  const role = data.role ?? 'user';
  const premium = data.premium ?? false;

  await getAuth().setCustomUserClaims(data.uid, { role, premium });

  return {
    success: true,
    uid: data.uid,
    claims: { role, premium }
  };
});

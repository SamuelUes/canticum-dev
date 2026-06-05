import * as functions from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../firestore';
import '../firebaseAdmin';

interface SetUserClaimsPayload {
  uid: string;
  role?: string;
  premium?: boolean;
}

const BOOTSTRAP_ADMIN_UID = 'ltrJLJ03APUJl31WRsFoSWyRWaG2';

interface RoleClaims {
  role: string;
  premium: boolean;
}

async function persistRoleClaims(uid: string, claims: RoleClaims): Promise<void> {
  await Promise.all([
    getAuth().setCustomUserClaims(uid, claims),
    getAppFirestore().collection('users').doc(uid).set(
      {
        role: claims.role,
        premium: claims.premium,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )
  ]);
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

  await persistRoleClaims(data.uid, { role, premium });

  return {
    success: true,
    uid: data.uid,
    claims: { role, premium }
  };
});

export const bootstrapInitialAdmin = functions.https.onCall(async (_data, context) => {
  const auth = context.auth;

  if (!auth || auth.uid !== BOOTSTRAP_ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Only the bootstrap admin account can run this function.');
  }

  const claims = { role: 'admin', premium: false };
  await persistRoleClaims(BOOTSTRAP_ADMIN_UID, claims);

  return {
    success: true,
    uid: BOOTSTRAP_ADMIN_UID,
    claims
  };
});

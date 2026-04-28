import * as functions from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import '../firebaseAdmin';
import { upsertUserInCloudSql } from '../cloudSql/users';
import { runStartupDiagnostics } from '../diagnostics';
import { getAppFirestore } from '../firestore';

export const onAuthUserCreate = functions.auth.user().onCreate(async (user) => {
  await runStartupDiagnostics();

  const uid = user.uid;

  const currentClaims = user.customClaims ?? {};
  const hasRoleClaim = typeof currentClaims.role === 'string' && currentClaims.role.length > 0;
  const hasPremiumClaim = typeof currentClaims.premium === 'boolean';

  if (!hasRoleClaim || !hasPremiumClaim) {
    await getAuth().setCustomUserClaims(uid, {
      role: hasRoleClaim ? currentClaims.role : 'user',
      premium: hasPremiumClaim ? currentClaims.premium : false
    });
  }

  const userRef = getAppFirestore().collection('users').doc(uid);

  const firestoreData: Record<string, unknown> = {
    role: hasRoleClaim ? currentClaims.role : 'user',
    plan: 'free',
    premium: hasPremiumClaim ? currentClaims.premium : false,
    email: user.email ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp()
  };

  if (user.displayName) {
    firestoreData.displayName = user.displayName;
  }

  await userRef.set(firestoreData, { merge: true });

  await userRef.collection('private').doc('meta').set(
    {
      emailVerified: user.emailVerified,
      providerData: user.providerData.map((provider) => provider.providerId),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  try {
    await upsertUserInCloudSql(user, user.displayName ?? undefined);
  } catch (error) {
    functions.logger.error('onAuthUserCreate cloudSql sync failed', error);
    throw error;
  }
});

import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';

export const getSubscriptionStatus = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const uid = context.auth.uid;
  const db = getFirestore();

  const userSnap = await db.collection('users').doc(uid).get();
  const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
  const inlineSubscription = (userData.subscription ?? {}) as Record<string, unknown>;

  let plan = typeof inlineSubscription.plan === 'string' ? inlineSubscription.plan : null;
  let status = typeof inlineSubscription.status === 'string' ? inlineSubscription.status : null;
  let platform = typeof inlineSubscription.platform === 'string' ? inlineSubscription.platform : null;
  let expiresAt = typeof inlineSubscription.expiresAt === 'string' ? inlineSubscription.expiresAt : null;

  if (!plan || !status) {
    const subsSnap = await db
      .collection('subscriptions')
      .where('userId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (!subsSnap.empty) {
      const subscriptionDoc = subsSnap.docs[0].data() as Record<string, unknown>;
      plan = typeof subscriptionDoc.plan === 'string' ? subscriptionDoc.plan : plan;
      status = typeof subscriptionDoc.status === 'string' ? subscriptionDoc.status : status;
      platform = typeof subscriptionDoc.platform === 'string' ? subscriptionDoc.platform : platform;
      expiresAt = typeof subscriptionDoc.expiresAt === 'string' ? subscriptionDoc.expiresAt : expiresAt;
    }
  }

  const premiumFromClaim = Boolean(context.auth.token.premium);
  const premiumFromPlan = typeof plan === 'string' && plan.toLowerCase().includes('premium');
  const premiumFromStatus = status === 'active';

  return {
    ok: true,
    uid,
    premium: premiumFromClaim || (premiumFromPlan && premiumFromStatus),
    subscription: {
      plan: plan ?? 'free',
      status: status ?? 'inactive',
      platform: platform ?? 'web',
      expiresAt
    }
  };
});

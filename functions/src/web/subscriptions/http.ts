import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { handlePreflight, sendJson, sendError, getPathSegments, getOptionalAuthContext } from '../../shared/http/http';
import { getPlans } from './getPlans';
import { getUserSubscription } from './getUserSubscription';

export const subscriptions = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  
  try {
    if (segments[0] === 'plans' && req.method === 'GET') {
      await getPlans(req, res);
      return;
    }

    if (segments[0] === 'user' && segments.length >= 2 && req.method === 'GET') {
      await getUserSubscription(req, res);
      return;
    }

    // POST /subscriptions/{subscriptionId}/cancel
    if (segments.length === 2 && segments[1] === 'cancel' && req.method === 'POST') {
      const authContext = await getOptionalAuthContext(req);
      if (!authContext) {
        sendError(res, 401, 'unauthenticated', 'Authentication required.');
        return;
      }

      const subscriptionId = segments[0];
      const db = getAppFirestore();

      const subRef = db.collection('subscriptions').doc(subscriptionId);
      const subSnap = await subRef.get();

      if (!subSnap.exists) {
        sendError(res, 404, 'not_found', 'Subscription not found.');
        return;
      }

      const subData = (subSnap.data() ?? {}) as Record<string, unknown>;

      if (String(subData.userId ?? '') !== authContext.uid) {
        const userDoc = await db.collection('users').doc(authContext.uid).get();
        const userData = (userDoc.data() ?? {}) as Record<string, unknown>;
        if (userData.role !== 'admin') {
          sendError(res, 403, 'forbidden', 'Access denied.');
          return;
        }
      }

      if (subData.status === 'canceled' || subData.status === 'cancelled') {
        sendError(res, 409, 'already_canceled', 'Subscription is already canceled.');
        return;
      }

      await subRef.update({
        status: 'canceled',
        cancelAtPeriodEnd: true,
        updatedAt: FieldValue.serverTimestamp()
      });

      sendJson(res, 200, { ok: true, status: 'canceled' });
      return;
    }

    sendError(res, 404, 'not_found', 'Endpoint not found');
  } catch (error) {
    console.error('Subscription handler error:', error);
    sendError(res, 500, 'internal_error', 'Internal server error');
  }
});

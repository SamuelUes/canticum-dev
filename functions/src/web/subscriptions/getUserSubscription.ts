import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { handlePreflight, sendJson, sendError, getOptionalAuthContext } from '../../shared/http/http';

export const getUserSubscription = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const authContext = await getOptionalAuthContext(req);
  if (!authContext) {
    sendError(res, 401, 'unauthenticated', 'Authentication required');
    return;
  }

  const segments = req.path.split('/').filter(Boolean);
  const userIdIndex = segments.indexOf('user') + 1;
  
  if (userIdIndex >= segments.length) {
    sendError(res, 400, 'invalid_request', 'User ID required');
    return;
  }

  const requestedUserId = segments[userIdIndex];
  const { uid: authUid } = authContext;

  // Users can only access their own subscription data unless they're admin
  if (requestedUserId !== authUid) {
    const userDoc = await getAppFirestore().collection('users').doc(authUid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin') {
      sendError(res, 403, 'forbidden', 'Access denied');
      return;
    }
  }

  try {
    const db = getAppFirestore();
    
    // Check user document first
    const userDoc = await db.collection('users').doc(requestedUserId).get();
    const userData = userDoc.data() || {};
    
    let subscription = null;
    
    // Check inline subscription in user document
    if (userData.subscription) {
      subscription = userData.subscription;
    } else {
      // Check separate subscriptions collection
      const subsQuery = await db
        .collection('subscriptions')
        .where('userId', '==', requestedUserId)
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get();

      if (!subsQuery.empty) {
        subscription = subsQuery.docs[0].data();
      }
    }

    // Default to free plan if no subscription found
    if (!subscription) {
      subscription = {
        plan: 'free',
        status: 'active',
        platform: 'web',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    sendJson(res, 200, { subscription });
  } catch (error) {
    console.error('Error getting user subscription:', error);
    sendError(res, 500, 'internal_error', 'Failed to get subscription');
  }
});

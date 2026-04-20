import * as functions from 'firebase-functions';
import { handlePreflight, sendJson, sendError, getPathSegments } from '../../shared/http/http';
import { getPlans } from './getPlans';
import { getUserSubscription } from './getUserSubscription';

export const subscriptions = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  
  try {
    if (segments[0] === 'plans' && req.method === 'GET') {
      // Handle GET /subscriptions/plans
      await getPlans(req, res);
      return;
    }

    if (segments[0] === 'user' && segments.length >= 2 && req.method === 'GET') {
      // Handle GET /subscriptions/user/{userId}
      await getUserSubscription(req, res);
      return;
    }

    sendError(res, 404, 'not_found', 'Endpoint not found');
  } catch (error) {
    console.error('Subscription handler error:', error);
    sendError(res, 500, 'internal_error', 'Internal server error');
  }
});

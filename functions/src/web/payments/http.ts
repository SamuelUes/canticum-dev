import * as functions from 'firebase-functions';
import { handlePreflight, sendJson, sendError, getPathSegments } from '../../shared/http/http';
import { createIntent } from './createIntent';

export const payments = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  
  try {
    if (segments[0] === 'create-intent' && req.method === 'POST') {
      // Handle POST /payments/create-intent
      await createIntent(req, res);
      return;
    }

    sendError(res, 404, 'not_found', 'Endpoint not found');
  } catch (error) {
    console.error('Payments handler error:', error);
    sendError(res, 500, 'internal_error', 'Internal server error');
  }
});

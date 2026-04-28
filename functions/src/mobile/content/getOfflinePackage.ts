import * as functions from 'firebase-functions/v1';
import { notImplemented } from '../../shared/errors';

export const getOfflinePackage = functions.https.onCall(async () => {
  notImplemented('getOfflinePackage');
});

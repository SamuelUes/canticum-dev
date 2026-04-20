import * as functions from 'firebase-functions';

export function ensureAdmin(role?: string): void {
  if (role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin role required.');
  }
}

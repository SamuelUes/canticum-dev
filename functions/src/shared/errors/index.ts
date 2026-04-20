import * as functions from 'firebase-functions';

export function notImplemented(featureName: string): never {
  throw new functions.https.HttpsError('unimplemented', `${featureName} is not implemented yet.`);
}

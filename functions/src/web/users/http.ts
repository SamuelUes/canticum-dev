import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import {
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  sendError,
  sendJson
} from '../../shared/http/http';
import {
  FREE_MAX_FAVORITES,
  countUserFavorites,
  resolveIsPremium
} from '../../shared/plan/planLimits';

function canAccessUser(authUid: string | null, targetUserId: string, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  return Boolean(authUid && authUid === targetUserId);
}

export const users = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);

  if (segments.length !== 4 || segments[1] !== 'favorites') {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const userId = segments[0];
  const songId = segments[2];
  const versionId = segments[3];

  if (!userId || !songId || !versionId) {
    sendError(res, 400, 'invalid_argument', 'userId, songId and versionId are required.');
    return;
  }

  const auth = await getOptionalAuthContext(req);

  if (!auth) {
    sendError(res, 401, 'unauthorized', 'Authenticated user required.');
    return;
  }

  if (!canAccessUser(auth.uid, userId, auth.token.role as string | undefined)) {
    sendError(res, 403, 'forbidden', 'Cannot access favorites for another user.');
    return;
  }

  const favoriteSongRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(songId);
  const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);

  if (req.method === 'GET') {
    const favoriteSnap = await favoriteVersionRef.get();

    if (!favoriteSnap.exists) {
      sendError(res, 404, 'not_found', 'Favorite not found.');
      return;
    }

    sendJson(res, 200, { isFavorite: true, songId, versionId });
    return;
  }

  if (req.method === 'PUT') {
    const premium = await resolveIsPremium(userId, auth.token);

    if (!premium) {
      const currentCount = await countUserFavorites(userId);
      const alreadyExists = (await favoriteVersionRef.get()).exists;

      if (!alreadyExists && currentCount >= FREE_MAX_FAVORITES) {
        sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_FAVORITES} favoritos. Actualiza a Premium para agregar m\u00e1s.`);
        return;
      }
    }

    await favoriteSongRef.set(
      {
        songId,
        userId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await favoriteVersionRef.set(
      {
        songId,
        versionId,
        userId,
        isFavorite: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await favoriteVersionRef.delete();

    const siblingFavorites = await favoriteSongRef.collection('versions').limit(1).get();
    if (siblingFavorites.empty) {
      await favoriteSongRef.delete();
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
});

import * as functions from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import {
  getBodyRecord,
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
import {
  getCloudSqlAdminUser,
  listCloudSqlAdminUsers,
  softDeleteCloudSqlAdminUser,
  updateCloudSqlAdminUserStatus,
  type CloudSqlAdminUserRow
} from '../../shared/cloudSql/admin';
import { setAlbumFavoriteInCloudSql } from '../../shared/cloudSql/albums';

function canAccessUser(authUid: string | null, targetUserId: string, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  return Boolean(authUid && authUid === targetUserId);
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeAdminStatus(raw: unknown): 'active' | 'away' {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'away' ? 'away' : 'active';
}

function normalizeAdminRole(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const allowed = new Set(['admin', 'user', 'moderator', 'editor']);
  return allowed.has(value) ? value : 'user';
}

function buildAdminUserSummary(
  cloudSqlUser: CloudSqlAdminUserRow,
  doc?: FirebaseFirestore.DocumentSnapshot
): {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  plan: string;
  premium: boolean;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
} {
  const data = (doc?.data() ?? {}) as Record<string, unknown>;

  return {
    uid: cloudSqlUser.firebaseUid,
    email: typeof data.email === 'string' ? data.email : cloudSqlUser.email,
    displayName: typeof data.displayName === 'string' ? data.displayName : cloudSqlUser.name,
    role: typeof data.role === 'string' ? data.role : 'user',
    plan: typeof data.plan === 'string' ? data.plan : 'free',
    premium: Boolean(data.premium),
    status: typeof data.status === 'string' ? data.status : cloudSqlUser.status,
    createdAt: toIsoString(data.createdAt) ?? cloudSqlUser.createdAt.toISOString(),
    updatedAt: toIsoString(data.updatedAt)
  };
}

async function updateAdminUserDocument(uid: string, updates: Record<string, unknown>): Promise<FirebaseFirestore.DocumentSnapshot> {
  const db = getAppFirestore();
  const docRef = db.collection('users').doc(uid);

  await docRef.set(
    {
      ...updates,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return docRef.get();
}

export const users = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const rawSegments = getPathSegments(req);
  const segments = rawSegments[0] === 'users' ? rawSegments.slice(1) : rawSegments;
  const resourceType = segments[0] === 'admin' ? 'admin' : segments[1];

  if (resourceType === 'admin') {
    const auth = await getOptionalAuthContext(req);

    if (!auth?.uid || auth.token.role !== 'admin') {
      sendError(res, 403, 'forbidden', 'Only admin can manage users.');
      return;
    }

    const db = getAppFirestore();
    const adminSegments = segments[0] === 'admin'
      ? segments.slice(1)
      : segments[1] === 'admin'
        ? segments.slice(2)
        : [];

    if (adminSegments.length === 0) {
      if (req.method !== 'GET') {
        sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
        return;
      }

      const limitParam = Number(req.query.limit);
      const max = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 50) : 12;
      const cloudSqlUsers = await listCloudSqlAdminUsers(max);
      const snapshots = await Promise.all(
        cloudSqlUsers.map((user) => db.collection('users').doc(user.firebaseUid).get())
      );
      const items = cloudSqlUsers.map((user, index) => buildAdminUserSummary(user, snapshots[index])).sort((a, b) => {
        const aDate = a.updatedAt ? Date.parse(a.updatedAt) : a.createdAt ? Date.parse(a.createdAt) : 0;
        const bDate = b.updatedAt ? Date.parse(b.updatedAt) : b.createdAt ? Date.parse(b.createdAt) : 0;
        return bDate - aDate;
      });

      sendJson(res, 200, {
        ok: true,
        total: items.length,
        items
      });
      return;
    }

    if (adminSegments.length !== 1 || !adminSegments[0]) {
      sendError(res, 404, 'not_found', 'Endpoint not found.');
      return;
    }

    const targetUid = adminSegments[0];
    const targetRef = db.collection('users').doc(targetUid);

    if (req.method === 'DELETE') {
      const sqlUser = await softDeleteCloudSqlAdminUser(targetUid);
      await updateAdminUserDocument(targetUid, { status: 'away' });

      sendJson(res, 200, {
        ok: true,
        user: buildAdminUserSummary(sqlUser, await targetRef.get())
      });
      return;
    }

    if (req.method !== 'PATCH') {
      sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
      return;
    }

    const body = getBodyRecord(req);
    const updates: Record<string, unknown> = {};
    const nextStatus = typeof body.status === 'string' && body.status.trim().length > 0 ? normalizeAdminStatus(body.status) : null;
    const nextRole = typeof body.role === 'string' && body.role.trim().length > 0 ? normalizeAdminRole(body.role) : null;

    if (nextStatus) {
      updates.status = nextStatus;
    }

    if (nextRole) {
      updates.role = nextRole;
    }

    if (Object.keys(updates).length === 0) {
      sendError(res, 400, 'invalid_argument', 'status or role is required.');
      return;
    }

    const currentSnap = await targetRef.get();
    const current = (currentSnap.data() ?? {}) as Record<string, unknown>;

    await updateAdminUserDocument(targetUid, updates);

    if (nextStatus) {
      await updateCloudSqlAdminUserStatus(targetUid, nextStatus);
    }

    if (nextRole) {
      const authUser = await getAuth().getUser(targetUid);
      const nextPremium = Boolean(current.premium ?? authUser.customClaims?.premium ?? false);
      await getAuth().setCustomUserClaims(targetUid, {
        role: nextRole,
        premium: nextPremium
      });
    }

    sendJson(res, 200, {
      ok: true,
      user: buildAdminUserSummary(
        (await getCloudSqlAdminUser(targetUid)) ?? ({
          id: 0,
          firebaseUid: targetUid,
          name: current.displayName ?? current.email ?? targetUid,
          email: typeof current.email === 'string' ? current.email : `${targetUid}@firebase.local`,
          status: typeof current.status === 'string' ? current.status : 'active',
          createdAt: new Date()
        } as CloudSqlAdminUserRow),
        await targetRef.get()
      )
    });
    return;
  }

  if (resourceType === 'favorites') {
    if (segments.length !== 4 && segments.length !== 5) {
      sendError(res, 404, 'not_found', 'Endpoint not found.');
      return;
    }

    const userId = segments[0];
    const favoriteType = segments.length >= 4 ? segments[2] : null;
    const itemId = segments.length >= 4 ? segments[3] : segments[2];
    const versionId = segments.length === 5 ? segments[4] : null;

    if (!userId || !itemId) {
      sendError(res, 400, 'invalid_argument', 'userId and itemId are required.');
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

    const isSongFavorite = favoriteType === 'songs' || !favoriteType;
    const isAlbumFavorite = favoriteType === 'albums';

    if (req.method === 'GET') {
      if (isSongFavorite && versionId) {
        const favoriteSongRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
        const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);
        const favoriteSnap = await favoriteVersionRef.get();

        sendJson(res, 200, { isFavorite: favoriteSnap.exists, songId: itemId, versionId });
        return;
      }

      if (isAlbumFavorite) {
        const favoriteAlbumRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
        const favoriteSnap = await favoriteAlbumRef.get();

        sendJson(res, 200, { isFavorite: favoriteSnap.exists, albumId: itemId });
        return;
      }

      sendError(res, 400, 'invalid_argument', 'Invalid favorite type or missing versionId for songs.');
      return;
    }

    if (req.method === 'PUT') {
      const premium = await resolveIsPremium(userId, auth.token);

      if (!premium) {
        const currentCount = await countUserFavorites(userId);
        let alreadyExists = false;

        if (isSongFavorite && versionId) {
          const favoriteSongRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
          const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);
          alreadyExists = (await favoriteVersionRef.get()).exists;
        } else if (isAlbumFavorite) {
          const favoriteAlbumRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
          alreadyExists = (await favoriteAlbumRef.get()).exists;
        }

        if (!alreadyExists && currentCount >= FREE_MAX_FAVORITES) {
          sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_FAVORITES} favoritos. Actualiza a Premium para agregar m\u00e1s.`);
          return;
        }
      }

      const db = getAppFirestore();
      const batch = db.batch();

      if (isSongFavorite && versionId) {
        const favoriteSongRef = db.collection('users').doc(userId).collection('favorites').doc(itemId);
        const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);

        batch.set(
          favoriteSongRef,
          {
            songId: itemId,
            userId,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        batch.set(
          favoriteVersionRef,
          {
            songId: itemId,
            versionId,
            userId,
            isFavorite: true,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      } else if (isAlbumFavorite) {
        const favoriteAlbumRef = db.collection('users').doc(userId).collection('favorites').doc(itemId);

        batch.set(
          favoriteAlbumRef,
          {
            albumId: itemId,
            userId,
            isFavorite: true,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      await batch.commit();

      if (isAlbumFavorite && auth.uid) {
        try {
          const albumSnap = await db.collection('albums').doc(itemId).get();
          const albumData = (albumSnap.data() ?? {}) as Record<string, unknown>;
          const sqlAlbumId = Number(albumData.sqlAlbumId ?? itemId);
          if (Number.isFinite(sqlAlbumId) && sqlAlbumId > 0) {
            const sqlMetrics = await setAlbumFavoriteInCloudSql(auth.uid, Math.floor(sqlAlbumId), true);
            if (sqlMetrics) {
              await db.collection('albums').doc(itemId).set({
                likeCount: sqlMetrics.likeCount,
                totalViews: sqlMetrics.totalViews,
                popularity: sqlMetrics.popularity,
                updatedAt: FieldValue.serverTimestamp()
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error('[users] Cloud SQL album favorite sync failed:', error);
        }
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      if (isSongFavorite && versionId) {
        const favoriteSongRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
        const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);

        await favoriteVersionRef.delete();

        const siblingFavorites = await favoriteSongRef.collection('versions').limit(1).get();
        if (siblingFavorites.empty) {
          await favoriteSongRef.delete();
        }
      } else if (isAlbumFavorite) {
        const favoriteAlbumRef = getAppFirestore().collection('users').doc(userId).collection('favorites').doc(itemId);
        await favoriteAlbumRef.delete();
      }

      if (isAlbumFavorite && auth.uid) {
        try {
          const albumSnap = await getAppFirestore().collection('albums').doc(itemId).get();
          const albumData = (albumSnap.data() ?? {}) as Record<string, unknown>;
          const sqlAlbumId = Number(albumData.sqlAlbumId ?? itemId);
          if (Number.isFinite(sqlAlbumId) && sqlAlbumId > 0) {
            const sqlMetrics = await setAlbumFavoriteInCloudSql(auth.uid, Math.floor(sqlAlbumId), false);
            if (sqlMetrics) {
              await getAppFirestore().collection('albums').doc(itemId).set({
                likeCount: sqlMetrics.likeCount,
                totalViews: sqlMetrics.totalViews,
                popularity: sqlMetrics.popularity,
                updatedAt: FieldValue.serverTimestamp()
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error('[users] Cloud SQL album favorite sync failed:', error);
        }
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  if (resourceType === 'bookmarks') {
    if (segments.length !== 3) {
      sendError(res, 404, 'not_found', 'Endpoint not found.');
      return;
    }

    const userId = segments[0];
    const repertoireId = segments[2];

    if (!userId || !repertoireId) {
      sendError(res, 400, 'invalid_argument', 'userId and repertoireId are required.');
      return;
    }

    const auth = await getOptionalAuthContext(req);

    if (!auth) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    if (!canAccessUser(auth.uid, userId, auth.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Cannot access bookmarks for another user.');
      return;
    }

    const bookmarkRef = getAppFirestore().collection('users').doc(userId).collection('bookmarks').doc(repertoireId);

    if (req.method === 'GET') {
      const bookmarkSnap = await bookmarkRef.get();

      if (!bookmarkSnap.exists) {
        sendJson(res, 200, { isBookmarked: false, repertoireId });
        return;
      }

      sendJson(res, 200, { isBookmarked: true, repertoireId });
      return;
    }

    if (req.method === 'PUT') {
      await bookmarkRef.set(
        {
          repertoireId,
          userId,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      await bookmarkRef.delete();

      sendJson(res, 200, { ok: true });
      return;
    }

    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  sendError(res, 404, 'not_found', 'Endpoint not found.');
});


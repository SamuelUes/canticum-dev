import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import { FREE_MAX_FAVORITES, countUserFavorites, isPremiumUser } from '../../shared/plan/planLimits';
import { setSongFavoriteInCloudSql } from '../../shared/cloudSql/songs';

interface ToggleFavoritePayload {
  songId: string;
  versionId: string;
  isFavorite: boolean;
}

export const toggleFavorite = functions.https.onCall(async (data: ToggleFavoritePayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
  const versionId = typeof data?.versionId === 'string' ? data.versionId.trim() : '';

  if (!songId || !versionId) {
    throw new functions.https.HttpsError('invalid-argument', 'songId and versionId are required.');
  }

  const uid = context.auth.uid;
  const db = getAppFirestore();
  const favoriteSongRef = db.collection('users').doc(uid).collection('favorites').doc(songId);
  const favoriteVersionRef = favoriteSongRef.collection('versions').doc(versionId);

  const resolveSqlSongId = async (): Promise<number | null> => {
    const direct = Number(songId);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct);
    }

    try {
      const songSnap = await db.collection('songs').doc(songId).get();
      if (!songSnap.exists) {
        return null;
      }

      const songData = (songSnap.data() ?? {}) as Record<string, unknown>;
      const sqlSongId = Number(songData.sqlSongId);
      return Number.isFinite(sqlSongId) && sqlSongId > 0 ? Math.floor(sqlSongId) : null;
    } catch {
      return null;
    }
  };

  if (Boolean(data?.isFavorite)) {
    if (!isPremiumUser(context.auth.token)) {
      const alreadyExists = (await favoriteVersionRef.get()).exists;
      if (!alreadyExists) {
        const currentCount = await countUserFavorites(uid);
        if (currentCount >= FREE_MAX_FAVORITES) {
          throw new functions.https.HttpsError(
            'permission-denied',
            `El plan Free permite hasta ${FREE_MAX_FAVORITES} favoritos. Actualiza a Premium para agregar m\u00e1s.`
          );
        }
      }
    }

    await favoriteSongRef.set(
      {
        songId,
        userId: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await favoriteVersionRef.set(
      {
        songId,
        versionId,
        userId: uid,
        isFavorite: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } else {
    await favoriteVersionRef.delete();

    const siblingFavorites = await favoriteSongRef.collection('versions').limit(1).get();
    if (siblingFavorites.empty) {
      await favoriteSongRef.delete();
    }
  }

  try {
    const sqlSongId = await resolveSqlSongId();
    if (sqlSongId) {
      const sqlMetrics = await setSongFavoriteInCloudSql(uid, sqlSongId, Boolean(data?.isFavorite));

      if (sqlMetrics) {
        const songSnap = await db.collection('songs').doc(songId).get();
        if (songSnap.exists) {
          await songSnap.ref.set(
            {
              likeCount: sqlMetrics.likeCount,
              popularity: sqlMetrics.popularity,
              totalViews: sqlMetrics.totalViews,
              updatedAt: FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
      }
    }
  } catch (error) {
    console.error('Cloud SQL favorite metric sync failed:', error);
  }

  return {
    ok: true,
    songId,
    versionId,
    isFavorite: Boolean(data?.isFavorite)
  };
});

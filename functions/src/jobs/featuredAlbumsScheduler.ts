import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import '../shared/firebaseAdmin';
import { getAppFirestore } from '../shared/firestore';
import { refreshFeaturedAlbumsSnapshot } from '../shared/cloudSql/albums';

function getRefreshLimit(): number {
  const raw = Number(process.env.FEATURED_ALBUMS_REFRESH_LIMIT ?? '100');
  if (!Number.isFinite(raw)) {
    return 100;
  }

  return Math.min(Math.max(Math.floor(raw), 1), 200);
}

function normalizeSnapshotWeek(snapshotWeek: string | Date): string {
  if (snapshotWeek instanceof Date) {
    return snapshotWeek.toISOString().slice(0, 10);
  }

  const date = new Date(snapshotWeek);
  if (Number.isNaN(date.getTime())) {
    return String(snapshotWeek);
  }

  return date.toISOString().slice(0, 10);
}

async function refreshFeaturedAlbumsInternal() {
  const cloudSqlLimit = getRefreshLimit();
  const fireStoreLimit = 10;
  const rows = await refreshFeaturedAlbumsSnapshot(cloudSqlLimit);

  functions.logger.info('Featured albums snapshot refreshed in Cloud SQL', {
    cloudSqlLimit,
    rows: rows.length,
    snapshotWeek: rows[0]?.snapshotWeek ?? null
  });

  if (rows.length === 0) {
    return null;
  }

  const db = getAppFirestore();
  const snapshotWeek = normalizeSnapshotWeek(rows[0].snapshotWeek);
  const metaDocRef = db.collection('featuredAlbumsMeta').doc('current');
  const batch = db.batch();

  // Delete existing subcollection documents
  const existingAlbumsSnap = await metaDocRef.collection('albums').get();
  existingAlbumsSnap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Add new album documents to subcollection (only top 10)
  const topAlbums = rows.slice(0, fireStoreLimit);
  topAlbums.forEach((row) => {
    const docId = String(row.albumId);
    batch.set(metaDocRef.collection('albums').doc(docId), {
      snapshotWeek,
      rankPosition: row.rankPosition,
      albumId: row.albumId,
      title: row.title,
      artistId: row.artistId,
      artistName: row.artistName,
      coverUrl: row.coverUrl,
      score: row.score,
      popularity: row.popularity,
      totalViews: row.totalViews,
      likeCount: row.likeCount,
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  // Update metadata document
  batch.set(metaDocRef, {
    snapshotWeek,
    limit: fireStoreLimit,
    count: topAlbums.length,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();

  functions.logger.info('Featured albums snapshot mirrored to Firestore', {
    snapshotWeek,
    count: topAlbums.length
  });

  return null;
}

export const refreshFeaturedAlbumsWeekly = functions
  .region('us-central1')
  .pubsub.schedule('0 4 * * 1')
  .timeZone(process.env.FEATURED_REFRESH_TZ || 'America/Mexico_City')
  .onRun(refreshFeaturedAlbumsInternal);

export const refreshFeaturedAlbumsOnDeploy = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      await refreshFeaturedAlbumsInternal();
      res.status(200).json({ success: true, message: 'Featured albums refreshed successfully' });
    } catch (error) {
      functions.logger.error('Failed to refresh featured albums on deploy', error);
      res.status(500).json({ success: false, error: 'Failed to refresh featured albums' });
    }
  });

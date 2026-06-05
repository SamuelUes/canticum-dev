import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import '../shared/firebaseAdmin';
import { getAppFirestore } from '../shared/firestore';
import { refreshFeaturedArtistsSnapshot, syncFeaturedArtistsToSuggestions } from '../shared/cloudSql/artists';

function getRefreshLimit(): number {
  const raw = Number(process.env.FEATURED_ARTISTS_REFRESH_LIMIT ?? '100');
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

async function refreshFeaturedArtistsInternal() {
  const cloudSqlLimit = getRefreshLimit();
  const fireStoreLimit = 6;
  const rows = await refreshFeaturedArtistsSnapshot(cloudSqlLimit);

  functions.logger.info('Featured artists snapshot refreshed in Cloud SQL', {
    cloudSqlLimit,
    rows: rows.length,
    snapshotWeek: rows[0]?.snapshotWeek ?? null
  });

  if (rows.length === 0) {
    return null;
  }

  // Sync to Cloud SQL artist_suggestions table (all 100)
  await syncFeaturedArtistsToSuggestions(rows);

  functions.logger.info('Featured artists synced to artist_suggestions table', {
    count: rows.length
  });

  // Sync to Firestore (only top 6)
  const db = getAppFirestore();
  const snapshotWeek = normalizeSnapshotWeek(rows[0].snapshotWeek);
  const metaDocRef = db.collection('featuredArtistsMeta').doc('current');
  const batch = db.batch();

  // Delete existing subcollection documents
  const existingArtistsSnap = await metaDocRef.collection('artists').get();
  existingArtistsSnap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Add new artist documents to subcollection (only top 6)
  const topArtists = rows.slice(0, fireStoreLimit);
  topArtists.forEach((row) => {
    const docId = String(row.artistId);
    batch.set(metaDocRef.collection('artists').doc(docId), {
      snapshotWeek,
      rankPosition: row.rankPosition,
      artistId: row.artistId,
      name: row.name,
      imageUrl: row.imageUrl,
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
    count: topArtists.length,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();

  functions.logger.info('Featured artists snapshot mirrored to Firestore', {
    snapshotWeek,
    count: topArtists.length
  });

  return null;
}

export const refreshFeaturedArtistsWeekly = functions
  .region('us-central1')
  .pubsub.schedule('0 4 * * 1')
  .timeZone(process.env.FEATURED_REFRESH_TZ || 'America/Mexico_City')
  .onRun(refreshFeaturedArtistsInternal);

export const refreshFeaturedArtistsOnDeploy = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      await refreshFeaturedArtistsInternal();
      res.status(200).json({ success: true, message: 'Featured artists refreshed successfully' });
    } catch (error) {
      functions.logger.error('Failed to refresh featured artists on deploy', error);
      res.status(500).json({ success: false, error: 'Failed to refresh featured artists' });
    }
  });

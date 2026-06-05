import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import '../shared/firebaseAdmin';
import { getAppFirestore } from '../shared/firestore';
import { refreshArtistSuggestionsSnapshot, refreshFeaturedSongsSnapshot } from '../shared/cloudSql/songs';

function getRefreshLimit(): number {
  const raw = Number(process.env.FEATURED_REFRESH_LIMIT ?? '100');
  if (!Number.isFinite(raw)) {
    return 100;
  }

  return Math.min(Math.max(Math.floor(raw), 1), 200);
}

function getSuggestionsLimit(): number {
  const raw = Number(process.env.ARTIST_SUGGESTIONS_LIMIT ?? '12');
  if (!Number.isFinite(raw)) {
    return 12;
  }
  return Math.min(Math.max(Math.floor(raw), 1), 50);
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

async function refreshFeaturedSongsInternal() {
  const limit = getRefreshLimit();
  const suggestionsLimit = getSuggestionsLimit();
  const rows = await refreshFeaturedSongsSnapshot(limit);
  const insertedSuggestions = await refreshArtistSuggestionsSnapshot(suggestionsLimit);

  functions.logger.info('Featured snapshot refreshed in Cloud SQL', {
    limit,
    rows: rows.length,
    snapshotWeek: rows[0]?.snapshotWeek ?? null,
    insertedSuggestions,
    suggestionsLimit
  });

  if (rows.length === 0) {
    return null;
  }

  const db = getAppFirestore();
  const snapshotWeek = normalizeSnapshotWeek(rows[0].snapshotWeek);
  const metaDocRef = db.collection('featuredSongsMeta').doc('current');
  const batch = db.batch();

  // Delete existing subcollection documents
  const existingSongsSnap = await metaDocRef.collection('songs').get();
  existingSongsSnap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // Add new song documents to subcollection
  rows.forEach((row) => {
    const docId = String(row.sqlSongId);
    batch.set(metaDocRef.collection('songs').doc(docId), {
      snapshotWeek,
      rankPosition: row.rankPosition,
      sqlSongId: row.sqlSongId,
      title: row.title,
      artistId: row.artistId,
      artistName: row.artistName,
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
    limit,
    count: rows.length,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();

  functions.logger.info('Featured snapshot mirrored to Firestore', {
    snapshotWeek,
    count: rows.length
  });

  return null;
}

export const refreshFeaturedSongsWeekly = functions
  .region('us-central1')
  .pubsub.schedule('0 4 * * 1')
  .timeZone(process.env.FEATURED_REFRESH_TZ || 'America/Mexico_City')
  .onRun(refreshFeaturedSongsInternal);

export const refreshFeaturedSongsOnDeploy = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    try {
      await refreshFeaturedSongsInternal();
      res.status(200).json({ success: true, message: 'Featured songs refreshed successfully' });
    } catch (error) {
      functions.logger.error('Failed to refresh featured songs on deploy', error);
      res.status(500).json({ success: false, error: 'Failed to refresh featured songs' });
    }
  });

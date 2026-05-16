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

export const refreshFeaturedSongsWeekly = functions
  .region('us-central1')
  .pubsub.schedule('0 4 * * 1')
  .timeZone(process.env.FEATURED_REFRESH_TZ || 'America/Mexico_City')
  .onRun(async () => {
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
    const collectionRef = db.collection('featuredSongs');

    const existingSnap = await collectionRef.where('snapshotWeek', '==', snapshotWeek).get();
    const batch = db.batch();

    existingSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    rows.forEach((row) => {
      const docId = `${snapshotWeek}_${String(row.rankPosition).padStart(3, '0')}`;
      batch.set(collectionRef.doc(docId), {
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

    batch.set(db.collection('featuredSongsMeta').doc('current'), {
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
  });

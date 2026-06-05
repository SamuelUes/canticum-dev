import * as functions from 'firebase-functions/v1';
import { getAppFirestore } from '../shared/firestore';
import '../shared/firebaseAdmin';

/**
 * One-time migration: Add status field to existing Firestore albums that lack it.
 * Run with: firebase functions:shell
 * migrateAlbumStatus()
 */
export const migrateAlbumStatus = functions.https.onRequest(async (req, res) => {
  const db = getAppFirestore();
  
  try {
    const albumsSnap = await db.collection('albums').get();
    console.log(`Found ${albumsSnap.size} albums in Firestore`);
    
    let updated = 0;
    const updates: FirebaseFirestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    
    for (const doc of albumsSnap.docs) {
      const data = doc.data();
      const currentStatus = typeof data.status === 'string' ? data.status.trim().toUpperCase() : '';
      console.log(`Album ${doc.id}: status="${currentStatus}" (type: ${typeof data.status})`);
      
      // Only update if status is missing, empty, or DRAFT
      if (currentStatus === 'PUBLISHED' || currentStatus === 'APPROVED') {
        console.log(`  -> Skipping (already public)`);
        continue;
      }
      
      console.log(`  -> Updating to PUBLISHED`);
      currentBatch.update(doc.ref, { status: 'PUBLISHED' });
      updated++;
      
      // Batch writes in groups of 500
      if (updated % 500 === 0) {
        await currentBatch.commit();
        currentBatch = db.batch();
      }
    }
    
    if (updated % 500 !== 0) {
      await currentBatch.commit();
    }
    
    res.json({ success: true, updated });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

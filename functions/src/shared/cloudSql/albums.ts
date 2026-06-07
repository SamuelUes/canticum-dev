import { type Pool } from 'pg';
import { getSharedPool } from './pool';

export interface CreateAlbumInput {
  artistId: number;
  title: string;
  releaseYear?: number;
  albumType: string;
  genre: string;
  coverUrl?: string;
  upc?: string;
  label?: string;
  tracks: Array<{
    songId: string;
    songTitle?: string;
    trackNumber: number;
  }>;
}

export interface CreateAlbumResult {
  albumId: number;
}

export async function createAlbumInCloudSql(input: CreateAlbumInput): Promise<CreateAlbumResult> {
  const client = await getSharedPool().connect();

  try {
    await client.query('BEGIN');

    // Insert album
    const imagesJson = input.coverUrl
      ? JSON.stringify([{ url: input.coverUrl, width: 1200, height: 1200 }])
      : '[]';

    const albumResult = await client.query<{ id: number }>(
      `
      INSERT INTO albums (artist_id, title, release_year, album_type, genres_json, cover_url, images_json, upc, label, status, total_tracks)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PUBLISHED', $10)
      RETURNING id;
      `,
      [
        input.artistId,
        input.title,
        input.releaseYear || null,
        input.albumType,
        JSON.stringify([input.genre]),
        input.coverUrl || null,
        imagesJson,
        input.upc || null,
        input.label || null,
        input.tracks.length
      ]
    );

    const albumId = albumResult.rows[0].id;

    // OPTIMIZATION: Batch fetch all songs first to avoid N+1 queries
    console.log(`[albums] Processing ${input.tracks.length} tracks for album ${albumId}`);
    
    const canticumIds = input.tracks.map(t => t.songId);
    const songResults = await client.query<{ id: number; canticum_id: string }>(
      `SELECT id, external_urls_json->>'canticum' as canticum_id 
       FROM songs 
       WHERE external_urls_json->>'canticum' = ANY($1)`,
      [canticumIds]
    );
    
    const songMap = new Map(songResults.rows.map(r => [r.canticum_id, r.id]));
    console.log(`[albums] Found ${songMap.size} songs via canticum IDs`);

    // For tracks not found by canticum ID, prepare fallback batch query
    const tracksNeedingFallback = input.tracks.filter(t => !songMap.has(t.songId) && t.songTitle);
    let fallbackSongMap = new Map<string, number>();
    
    if (tracksNeedingFallback.length > 0) {
      const songTitles = tracksNeedingFallback.map(t => t.songTitle);
      const fallbackResults = await client.query<{ id: number; title: string }>(
        `SELECT id, title FROM songs WHERE title = ANY($1) AND artist_id = $2`,
        [songTitles, input.artistId]
      );
      fallbackSongMap = new Map(fallbackResults.rows.map(r => [r.title, r.id]));
      console.log(`[albums] Found ${fallbackSongMap.size} songs via title/artist fallback`);
    }

    // Insert album_songs using the pre-fetched maps
    for (const track of input.tracks) {
      let sqlSongId: number | null = songMap.get(track.songId) ?? null;
      
      if (!sqlSongId && track.songTitle) {
        sqlSongId = fallbackSongMap.get(track.songTitle) ?? null;
      }

      if (sqlSongId) {
        console.log(`[albums] Inserting into album_songs with track number: ${track.trackNumber}`);
        await client.query(
          `
          INSERT INTO album_songs (album_id, song_id, track_number, is_primary_release)
          VALUES ($1, $2, $3, FALSE)
          ON CONFLICT (album_id, song_id) DO UPDATE SET track_number = EXCLUDED.track_number
          `,
          [albumId, sqlSongId, track.trackNumber]
        );
        console.log(`[albums] Successfully inserted track ${track.trackNumber} for song ${sqlSongId}`);
      } else {
        console.warn(`[albums] Could not find song for track ${track.trackNumber}, skipping`);
      }
    }

    await client.query('COMMIT');

    return { albumId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

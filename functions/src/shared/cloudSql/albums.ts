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

    // Insert album_songs
    console.log(`[albums] Processing ${input.tracks.length} tracks for album ${albumId}`);
    for (const track of input.tracks) {
      console.log(`[albums] Looking for song with canticum ID: ${track.songId}`);
      
      let sqlSongId: number | null = null;

      // First try to find by external_urls_json->>'canticum'
      const songResult = await client.query<{ id: number }>(
        "SELECT id FROM songs WHERE external_urls_json->>'canticum' = $1 LIMIT 1",
        [track.songId]
      );

      console.log(`[albums] Query result for song ${track.songId}: ${songResult.rows.length} rows found`);

      if (songResult.rows.length > 0) {
        sqlSongId = songResult.rows[0].id;
        console.log(`[albums] Found SQL song ID via canticum ID: ${sqlSongId}`);
      } else {
        // Fallback: try to find by title and artist if songTitle is provided
        if (track.songTitle) {
          console.log(`[albums] Trying fallback search by title and artist for: ${track.songTitle}`);
          const fallbackResult = await client.query<{ id: number }>(
            'SELECT id FROM songs WHERE title = $1 AND artist_id = $2 LIMIT 1',
            [track.songTitle, input.artistId]
          );
          
          if (fallbackResult.rows.length > 0) {
            sqlSongId = fallbackResult.rows[0].id;
            console.log(`[albums] Found SQL song ID via title/artist fallback: ${sqlSongId}`);
          } else {
            console.warn(`[albums] Song not found via fallback: ${track.songTitle}`);
          }
        } else {
          console.warn(`[albums] No songTitle provided for fallback search`);
        }
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

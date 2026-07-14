import { type Pool } from 'pg';
import { getSharedPool } from './pool';

export interface FeaturedAlbumSnapshotRow {
  snapshotWeek: string;
  rankPosition: number;
  albumId: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  coverUrl: string | null;
  score: number;
  popularity: number;
  totalViews: number;
  likeCount: number;
}

export async function refreshFeaturedAlbumsSnapshot(limit: number = 50, snapshotWeek?: string): Promise<FeaturedAlbumSnapshotRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const normalizedWeek = typeof snapshotWeek === 'string' && snapshotWeek.trim().length > 0
    ? snapshotWeek.trim()
    : null;

  let query: string;
  let params: (number | string | null)[];

  if (normalizedWeek === null) {
    query = `
      SELECT
        snapshot_week,
        rank_position,
        album_id,
        score,
        popularity,
        total_views,
        like_count
      FROM refresh_featured_albums_snapshot($1);
    `;
    params = [safeLimit];
  } else {
    query = `
      SELECT
        snapshot_week,
        rank_position,
        album_id,
        score,
        popularity,
        total_views,
        like_count
      FROM refresh_featured_albums_snapshot($1, $2);
    `;
    params = [safeLimit, normalizedWeek];
  }

  const refreshResult = await getSharedPool().query<{
    snapshot_week: Date;
    rank_position: number;
    album_id: number;
    score: string;
    popularity: number;
    total_views: number;
    like_count: number;
  }>(query, params);

  const ids = Array.from(new Set(refreshResult.rows.map((row) => row.album_id).filter((id) => Number.isFinite(id) && id > 0)));

  if (ids.length === 0) {
    return [];
  }

  const metadataResult = await getSharedPool().query<{
    sqlAlbumId: number;
    title: string;
    artistId: number | null;
    artistName: string | null;
    coverUrl: string | null;
  }>(
    `
      SELECT
        a.id AS "sqlAlbumId",
        a.title AS "title",
        a.artist_id AS "artistId",
        art.name AS "artistName",
        a.cover_url AS "coverUrl"
      FROM albums a
      LEFT JOIN artists art ON art.id = a.artist_id
      WHERE a.id = ANY($1::INT[]);
    `,
    [ids]
  );

  const metadataByAlbumId = new Map<number, { title: string; artistId: number | null; artistName: string | null; coverUrl: string | null }>();
  metadataResult.rows.forEach((row) => {
    metadataByAlbumId.set(row.sqlAlbumId, {
      title: row.title,
      artistId: row.artistId,
      artistName: row.artistName,
      coverUrl: row.coverUrl
    });
  });

  return refreshResult.rows.map((row) => {
    const meta = metadataByAlbumId.get(row.album_id);
    return {
      snapshotWeek: row.snapshot_week.toISOString().slice(0, 10),
      rankPosition: row.rank_position,
      albumId: row.album_id,
      title: meta?.title ?? `Album ${row.album_id}`,
      artistId: meta?.artistId ?? null,
      artistName: meta?.artistName ?? null,
      coverUrl: meta?.coverUrl ?? null,
      score: Number(row.score),
      popularity: row.popularity,
      totalViews: row.total_views,
      likeCount: row.like_count
    };
  });
}

export async function listFeaturedAlbumsSnapshot(limit: number = 50, snapshotWeek?: string): Promise<FeaturedAlbumSnapshotRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const normalizedWeek = typeof snapshotWeek === 'string' && snapshotWeek.trim().length > 0
    ? snapshotWeek.trim()
    : null;

  const result = await getSharedPool().query<FeaturedAlbumSnapshotRow>(
    `
      WITH latest_week AS (
        SELECT MAX(snapshot_week) AS max_week FROM featured_albums
      )
      SELECT
        fa.snapshot_week::TEXT AS "snapshotWeek",
        fa.rank_position AS "rankPosition",
        fa.album_id AS "albumId",
        a.title AS "title",
        a.artist_id AS "artistId",
        art.name AS "artistName",
        a.cover_url AS "coverUrl",
        fa.score::FLOAT AS "score",
        fa.popularity AS "popularity",
        fa.total_views AS "totalViews",
        fa.like_count AS "likeCount"
      FROM featured_albums fa
      INNER JOIN albums a ON a.id = fa.album_id
      LEFT JOIN artists art ON art.id = a.artist_id
      CROSS JOIN latest_week lw
      WHERE fa.snapshot_week = COALESCE($2::DATE, lw.max_week)
      ORDER BY fa.rank_position ASC
      LIMIT $1;
    `,
    [safeLimit, normalizedWeek]
  );

  return result.rows;
}

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
    versionId?: number;
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

    // Batch fetch all songs by canticum ID to avoid N+1 queries
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

    // Fallback: batch fetch by title + artist for tracks not found by canticum ID
    const tracksNeedingFallback = input.tracks.filter(t => !songMap.has(t.songId) && t.songTitle);
    let fallbackSongMap = new Map<string, number>();

    if (tracksNeedingFallback.length > 0) {
      const songTitles = tracksNeedingFallback.map(t => t.songTitle!);
      const fallbackResults = await client.query<{ id: number; title: string }>(
        `SELECT id, title FROM songs WHERE title = ANY($1) AND artist_id = $2`,
        [songTitles, input.artistId]
      );
      fallbackSongMap = new Map(fallbackResults.rows.map(r => [r.title, r.id]));
      console.log(`[albums] Found ${fallbackSongMap.size} songs via title/artist fallback`);
    }

    // Resolve all tracks to SQL song IDs
    const resolvedTracks: Array<{ sqlSongId: number; trackNumber: number; versionId: number | null }> = [];
    for (const track of input.tracks) {
      let sqlSongId: number | null = songMap.get(track.songId) ?? null;

      if (!sqlSongId && track.songTitle) {
        sqlSongId = fallbackSongMap.get(track.songTitle) ?? null;
      }

      if (sqlSongId) {
        resolvedTracks.push({
          sqlSongId,
          trackNumber: track.trackNumber,
          versionId: typeof track.versionId === 'number' && Number.isFinite(track.versionId) && track.versionId > 0 ? track.versionId : null
        });
      } else {
        console.warn(`[albums] Could not find song for track ${track.trackNumber}, skipping`);
      }
    }

    if (resolvedTracks.length === 0) {
      throw new Error('No valid songs found for album tracks.');
    }

    const sqlSongIds = resolvedTracks.map(t => t.sqlSongId);

    // Check which songs already belong to a different album
    const existingAlbumsResult = await client.query<{ id: number; album_id: number | null }>(
      `SELECT id, album_id FROM songs WHERE id = ANY($1)`,
      [sqlSongIds]
    );

    const songsWithOtherAlbum = new Map<number, number>();
    for (const row of existingAlbumsResult.rows) {
      if (row.album_id !== null && row.album_id !== albumId) {
        songsWithOtherAlbum.set(row.id, row.album_id);
      }
    }

    // Detach songs from their previous album if they belonged to a different one
    if (songsWithOtherAlbum.size > 0) {
      const songsToDetach = Array.from(songsWithOtherAlbum.keys());
      const oldAlbumIds = Array.from(new Set(songsWithOtherAlbum.values()));

      console.log(`[albums] Detaching ${songsToDetach.length} songs from previous albums: ${oldAlbumIds.join(', ')}`);

      await client.query(
        `DELETE FROM album_songs WHERE song_id = ANY($1)`,
        [songsToDetach]
      );

      // Recalculate total_tracks on each affected old album
      for (const oldAlbumId of oldAlbumIds) {
        await client.query(
          `UPDATE albums SET total_tracks = (SELECT COUNT(*)::INT FROM album_songs WHERE album_id = $1) WHERE id = $1`,
          [oldAlbumId]
        );
      }
    }

    // Set songs.album_id for all resolved songs (enforces 1:1 album membership)
    await client.query(
      `UPDATE songs SET album_id = $1 WHERE id = ANY($2)`,
      [albumId, sqlSongIds]
    );
    console.log(`[albums] Set album_id=${albumId} on ${sqlSongIds.length} songs`);

    // Batch insert into album_songs (single query instead of N loop iterations)
    const albumSongsValues: string[] = [];
    const albumSongsParams: unknown[] = [albumId];
    let paramIdx = 2;

    for (const track of resolvedTracks) {
      albumSongsValues.push(`($1, $${paramIdx}, $${paramIdx + 1}, TRUE, $${paramIdx + 2})`);
      albumSongsParams.push(track.sqlSongId, track.trackNumber, track.versionId);
      paramIdx += 3;
    }

    await client.query(
      `INSERT INTO album_songs (album_id, song_id, track_number, is_primary_release, version_id)
       VALUES ${albumSongsValues.join(', ')}
       ON CONFLICT (album_id, song_id) DO UPDATE SET track_number = EXCLUDED.track_number, is_primary_release = TRUE, version_id = EXCLUDED.version_id`,
      albumSongsParams
    );
    console.log(`[albums] Batch inserted ${resolvedTracks.length} album_songs entries`);

    // Update total_tracks to reflect the actual inserted count
    await client.query(
      `UPDATE albums SET total_tracks = (SELECT COUNT(*)::INT FROM album_songs WHERE album_id = $1) WHERE id = $1`,
      [albumId]
    );

    await client.query('COMMIT');

    return { albumId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface AlbumSongVersionInfo {
  sqlSongId: number;
  trackNumber: number;
  versionId: number | null;
  versionName: string | null;
}

export async function getAlbumSongsWithVersions(sqlAlbumId: number): Promise<AlbumSongVersionInfo[]> {
  const result = await getSharedPool().query<AlbumSongVersionInfo>(
    `
      SELECT
        als.song_id AS "sqlSongId",
        als.track_number AS "trackNumber",
        als.version_id AS "versionId",
        sv.version_name AS "versionName"
      FROM album_songs als
      LEFT JOIN song_versions sv ON sv.id = als.version_id
      WHERE als.album_id = $1
      ORDER BY als.track_number ASC;
    `,
    [sqlAlbumId]
  );

  return result.rows;
}

export interface AlbumMetricRow {
  sqlAlbumId: number;
  totalViews: number;
  likeCount: number;
  popularity: number;
}

async function ensureCloudSqlUserByFirebaseUid(
  firebaseUid: string,
  client: { query: Pool['query'] }
): Promise<number | null> {
  const normalizedUid = typeof firebaseUid === 'string' ? firebaseUid.trim() : '';
  if (!normalizedUid) {
    return null;
  }

  const safeEmail = `${normalizedUid}@firebase.local`;
  const safeName = `user-${normalizedUid.slice(0, 8)}`;

  const result = await client.query<{ id: number }>(
    `
      WITH existing AS (
        SELECT id
        FROM users
        WHERE firebase_uid = $1
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO users (firebase_uid, name, email, auth_provider)
        SELECT $1, $2, $3, 'firebase_auth'
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (email)
        DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid
        RETURNING id
      )
      SELECT id FROM existing
      UNION ALL
      SELECT id FROM inserted
      LIMIT 1;
    `,
    [normalizedUid, safeName, safeEmail]
  );

  return result.rows[0]?.id ?? null;
}

export async function setAlbumFavoriteInCloudSql(
  firebaseUid: string,
  sqlAlbumId: number,
  isFavorite: boolean
): Promise<AlbumMetricRow | null> {
  const client = await getSharedPool().connect();

  try {
    await client.query('BEGIN');

    const userId = await ensureCloudSqlUserByFirebaseUid(firebaseUid, client);
    if (!userId) {
      await client.query('ROLLBACK');
      return null;
    }

    if (isFavorite) {
      await client.query(
        `INSERT INTO album_likes (album_id, user_id) VALUES ($1, $2) ON CONFLICT (album_id, user_id) DO NOTHING`,
        [sqlAlbumId, userId]
      );
    } else {
      await client.query(
        `DELETE FROM album_likes WHERE album_id = $1 AND user_id = $2`,
        [sqlAlbumId, userId]
      );
    }

    await client.query('SELECT sync_album_metrics_by_id($1)', [sqlAlbumId]);

    const metricResult = await client.query<{
      totalViews: number;
      likeCount: number;
      popularity: number;
    }>(
      `
        SELECT
          COALESCE(total_views, 0)::INT AS "totalViews",
          COALESCE(like_count, 0)::INT AS "likeCount",
          COALESCE(popularity, 0)::SMALLINT AS "popularity"
        FROM albums
        WHERE id = $1;
      `,
      [sqlAlbumId]
    );

    await client.query('COMMIT');

    if (!metricResult.rows.length) {
      return null;
    }

    const m = metricResult.rows[0];
    return {
      sqlAlbumId,
      totalViews: m.totalViews,
      likeCount: m.likeCount,
      popularity: m.popularity
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

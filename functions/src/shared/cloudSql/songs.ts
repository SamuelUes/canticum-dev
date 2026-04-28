import { Pool, type PoolConfig } from 'pg';

export interface VersionInput {
  versionName: string;
  instrumentName: string;
  artistId?: number | null;
  artistName?: string | null;
  tone?: string | null;
  notationType?: string | null;
  audioReferenceUrl?: string | null;
}

interface CreateSongDraftCloudSqlInput {
  firebaseUid: string;
  title: string;
  year?: number | null;
  liturgicalUse?: string | null;
  filePath?: string | null;
  previewUrl?: string | null;
  artistId?: number | null;
  versions: VersionInput[];
}

export interface CloudSqlSongVersionRow {
  id: number;
  versionName: string;
  instrumentId: number | null;
  instrumentName: string | null;
  artistId: number | null;
  artistName: string | null;
  audioReferenceUrl: string | null;
}

interface CloudSqlSongDraftRow {
  id: number;
  userId: number;
  stateId: number;
  title: string;
  artistId: number | null;
  versions: CloudSqlSongVersionRow[];
}

export interface RepertoireSongSearchRow {
  songId: number;
  versionId: number | null;
  songTitle: string;
  songArtistId: number | null;
  songArtistName: string | null;
  versionName: string | null;
  versionArtistId: number | null;
  versionArtistName: string | null;
  instrumentName: string | null;
  matchType: 'song' | 'version';
}

interface CreateRepertoireInCloudSqlInput {
  firebaseUid: string;
  title: string;
  liturgicalType?: string | null;
  songIds: number[];
  userEmail?: string | null;
  userName?: string | null;
}

interface CloudSqlRepertoireRow {
  id: number;
}

let pool: Pool | null = null;

function getRequiredEnv(key: string, fallbackKey?: string): string {
  const value = process.env[key] ?? (fallbackKey ? process.env[fallbackKey] : undefined);
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    throw new Error(`Missing required Cloud SQL env var: ${key}${fallbackKey ? ` (or ${fallbackKey})` : ''}`);
  }

  return normalized;
}

function getOptionalEnv(key: string, fallbackKey?: string): string | undefined {
  const value = process.env[key] ?? (fallbackKey ? process.env[fallbackKey] : undefined);
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || undefined;
}

function getPoolConfig(): PoolConfig {
  const database = getRequiredEnv('CLOUD_SQL_DATABASE', 'DB_NAME');
  const user = getRequiredEnv('CLOUD_SQL_USER', 'DB_USER');
  const password = getRequiredEnv('CLOUD_SQL_PASSWORD', 'DB_PASSWORD');

  const host = getOptionalEnv('DB_HOST');
  const portValue = getOptionalEnv('CLOUD_SQL_PORT', 'DB_PORT');
  const port = portValue ? Number(portValue) : 5432;

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('Invalid Cloud SQL port. Set CLOUD_SQL_PORT or DB_PORT with a positive number.');
  }

  if (host) {
    return {
      host,
      port,
      database,
      user,
      password,
      ssl: getOptionalEnv('CLOUD_SQL_SSL', 'DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      max: 5
    };
  }

  const connectionName = getOptionalEnv('CLOUD_SQL_CONNECTION_STRING', 'CLOUD_SQL_CONNECTION_NAME');
  if (!connectionName) {
    throw new Error('Missing Cloud SQL host. Set DB_HOST or CLOUD_SQL_CONNECTION_STRING/CLOUD_SQL_CONNECTION_NAME.');
  }

  return {
    host: `/cloudsql/${connectionName}`,
    port,
    database,
    user,
    password,
    ssl: false,
    max: 5
  };
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig());
  }

  return pool;
}

function normalizeInstrumentNames(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return ['Letra'];
  }

  const unique = new Map<string, string>();
  for (const rawName of input) {
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) {
      continue;
    }
    const key = name.toLocaleLowerCase();
    if (!unique.has(key)) {
      unique.set(key, name);
    }
  }

  return unique.size > 0 ? Array.from(unique.values()) : ['Letra'];
}

export async function createSongDraftInCloudSql(input: CreateSongDraftCloudSqlInput): Promise<CloudSqlSongDraftRow> {
  const client = await getPool().connect();
  const versionInputs = input.versions.length > 0
    ? input.versions
    : [{ versionName: 'Versión 1', instrumentName: 'Letra' }];

  try {
    await client.query('BEGIN');

    const songInsertQuery = `
      WITH user_row AS (
        SELECT id
        FROM users
        WHERE firebase_uid = $1
        LIMIT 1
      ),
      state_row AS (
        SELECT id
        FROM song_states
        WHERE code = 'DRAFT'
        LIMIT 1
      )
      INSERT INTO songs (user_id, state_id, title, year, liturgical_use, file_path, preview_url, artist_id)
      SELECT user_row.id, state_row.id, $2, $3, $4, $5, $6, $7
      FROM user_row, state_row
      RETURNING id, user_id AS "userId", state_id AS "stateId", title, artist_id AS "artistId";
    `;

    const songResult = await client.query<Omit<CloudSqlSongDraftRow, 'versions'>>(songInsertQuery, [
      input.firebaseUid,
      input.title,
      typeof input.year === 'number' ? input.year : null,
      input.liturgicalUse ?? null,
      input.filePath ?? '',
      input.previewUrl ?? null,
      input.artistId ?? null
    ]);

    if (!songResult.rows.length) {
      throw new Error('Cloud SQL song draft insert returned no rows. Verify users.firebase_uid and song_states seed data.');
    }

    const songRow = songResult.rows[0];
    const versions: CloudSqlSongVersionRow[] = [];

    for (const vi of versionInputs) {
      const instrumentName = (vi.instrumentName ?? 'Letra').trim() || 'Letra';
      const instrumentResult = await client.query<{ id: number; name: string }>(
        `
          INSERT INTO instruments (name)
          VALUES ($1)
          ON CONFLICT ((lower(name))) DO UPDATE SET name = instruments.name
          RETURNING id, name;
        `,
        [instrumentName]
      );

      if (!instrumentResult.rows.length) {
        throw new Error(`Cloud SQL instrument upsert returned no rows for instrument '${instrumentName}'.`);
      }

      const instrumentRow = instrumentResult.rows[0];
      const versionArtistId = vi.artistId ?? null;

      const versionResult = await client.query<{ id: number; versionName: string; instrumentId: number | null; artistId: number | null; audioReferenceUrl: string | null }>(
        `
          INSERT INTO song_versions (
            song_id,
            artist_id,
            instrument_id,
            version_name,
            tone,
            notation_type,
            audio_reference_url,
            is_premium
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
          RETURNING id, version_name AS "versionName", instrument_id AS "instrumentId", artist_id AS "artistId", audio_reference_url AS "audioReferenceUrl";
        `,
        [
          songRow.id,
          versionArtistId,
          instrumentRow.id,
          (vi.versionName ?? 'Versión 1').trim() || 'Versión 1',
          vi.tone ?? null,
          vi.notationType ?? null,
          vi.audioReferenceUrl ?? null
        ]
      );

      if (!versionResult.rows.length) {
        throw new Error('Cloud SQL song version insert returned no rows.');
      }

      versions.push({
        ...versionResult.rows[0],
        instrumentName: instrumentRow.name,
        artistName: vi.artistName ?? null
      });
    }

    await client.query('COMMIT');

    return {
      ...songRow,
      versions
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteSongByIdInCloudSql(songId: number): Promise<void> {
  await getPool().query('DELETE FROM songs WHERE id = $1;', [songId]);
}

export interface ArtistSongRow {
  id: number;
  title: string;
  liturgicalUse: string | null;
  year: number | null;
  ownerFirebaseUid: string | null;
  status: string | null;
}

export async function listSongsByArtistId(artistId: number, limit: number = 50): Promise<ArtistSongRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const result = await getPool().query<ArtistSongRow>(
    `
      SELECT
        s.id AS "id",
        s.title AS "title",
        s.liturgical_use AS "liturgicalUse",
        s.year AS "year",
        u.firebase_uid AS "ownerFirebaseUid",
        ss.code AS "status"
      FROM songs s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN song_states ss ON ss.id = s.state_id
      WHERE s.artist_id = $1
      ORDER BY s.title ASC, s.id ASC
      LIMIT $2;
    `,
    [artistId, safeLimit]
  );
  return result.rows;
}

export interface SongMetaRow {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  ownerFirebaseUid: string | null;
  status: string | null;
}

export async function getSongMetaBySqlId(sqlSongId: number): Promise<SongMetaRow | null> {
  const result = await getPool().query<SongMetaRow>(
    `
      SELECT
        s.id AS "id",
        s.title AS "title",
        s.artist_id AS "artistId",
        a.name AS "artistName",
        u.firebase_uid AS "ownerFirebaseUid",
        ss.code AS "status"
      FROM songs s
      LEFT JOIN artists a ON a.id = s.artist_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN song_states ss ON ss.id = s.state_id
      WHERE s.id = $1
      LIMIT 1;
    `,
    [sqlSongId]
  );
  return result.rows[0] ?? null;
}

export interface SongMetricRow {
  sqlSongId: number;
  totalViews: number;
  likeCount: number;
  popularity: number;
  artistId: number | null;
}

function clampMetricScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeSongPopularity(totalViews: number, likeCount: number): number {
  const safeViews = Number.isFinite(totalViews) && totalViews > 0 ? totalViews : 0;
  const safeLikes = Number.isFinite(likeCount) && likeCount > 0 ? likeCount : 0;
  const score = Math.log10(safeViews + 1) * 20 + Math.log10(safeLikes + 1) * 12;
  return clampMetricScore(score);
}

function computeArtistPopularity(totalViews: number, likeCount: number): number {
  const safeViews = Number.isFinite(totalViews) && totalViews > 0 ? totalViews : 0;
  const safeLikes = Number.isFinite(likeCount) && likeCount > 0 ? likeCount : 0;
  const score = Math.log10(safeViews + 1) * 20 + Math.log10(safeLikes + 1) * 10;
  return clampMetricScore(score);
}

async function syncArtistMetricsById(
  artistId: number,
  client: { query: Pool['query'] }
): Promise<void> {
  const aggregate = await client.query<{ totalViews: number; likeCount: number }>(
    `
      SELECT
        COALESCE(SUM(total_views), 0)::INT AS "totalViews",
        COALESCE(SUM(like_count), 0)::INT AS "likeCount"
      FROM songs
      WHERE artist_id = $1;
    `,
    [artistId]
  );

  const row = aggregate.rows[0] ?? { totalViews: 0, likeCount: 0 };
  const popularity = computeArtistPopularity(Number(row.totalViews ?? 0), Number(row.likeCount ?? 0));

  await client.query(
    `
      UPDATE artists
      SET
        total_views = $2,
        like_count = $3,
        popularity = $4
      WHERE id = $1;
    `,
    [artistId, Number(row.totalViews ?? 0), Number(row.likeCount ?? 0), popularity]
  );
}

export async function incrementSongViewInCloudSql(sqlSongId: number): Promise<SongMetricRow | null> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const incrementResult = await client.query<{
      id: number;
      totalViews: number;
      likeCount: number;
      artistId: number | null;
    }>(
      `
        UPDATE songs
        SET total_views = COALESCE(total_views, 0) + 1
        WHERE id = $1
        RETURNING
          id,
          COALESCE(total_views, 0)::INT AS "totalViews",
          COALESCE(like_count, 0)::INT AS "likeCount",
          artist_id AS "artistId";
      `,
      [sqlSongId]
    );

    if (!incrementResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const updated = incrementResult.rows[0];
    const popularity = computeSongPopularity(updated.totalViews, updated.likeCount);

    await client.query(
      'UPDATE songs SET popularity = $2 WHERE id = $1;',
      [sqlSongId, popularity]
    );

    if (updated.artistId && Number.isFinite(updated.artistId)) {
      await syncArtistMetricsById(updated.artistId, client);
    }

    await client.query('COMMIT');

    return {
      sqlSongId,
      totalViews: updated.totalViews,
      likeCount: updated.likeCount,
      popularity,
      artistId: updated.artistId
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setSongFavoriteInCloudSql(firebaseUid: string, sqlSongId: number, isFavorite: boolean): Promise<SongMetricRow | null> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{ id: number }>(
      'SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1;',
      [firebaseUid]
    );

    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const userId = userResult.rows[0].id;

    if (isFavorite) {
      await client.query(
        `
          INSERT INTO favorites (user_id, song_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, song_id) DO NOTHING;
        `,
        [userId, sqlSongId]
      );
    } else {
      await client.query(
        'DELETE FROM favorites WHERE user_id = $1 AND song_id = $2;',
        [userId, sqlSongId]
      );
    }

    const aggregateResult = await client.query<{
      id: number;
      totalViews: number;
      likeCount: number;
      artistId: number | null;
    }>(
      `
        UPDATE songs s
        SET like_count = (
          SELECT COUNT(*)::INT
          FROM favorites f
          WHERE f.song_id = s.id
        )
        WHERE s.id = $1
        RETURNING
          s.id,
          COALESCE(s.total_views, 0)::INT AS "totalViews",
          COALESCE(s.like_count, 0)::INT AS "likeCount",
          s.artist_id AS "artistId";
      `,
      [sqlSongId]
    );

    if (!aggregateResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const updated = aggregateResult.rows[0];
    const popularity = computeSongPopularity(updated.totalViews, updated.likeCount);

    await client.query('UPDATE songs SET popularity = $2 WHERE id = $1;', [sqlSongId, popularity]);

    if (updated.artistId && Number.isFinite(updated.artistId)) {
      await syncArtistMetricsById(updated.artistId, client);
    }

    await client.query('COMMIT');

    return {
      sqlSongId,
      totalViews: updated.totalViews,
      likeCount: updated.likeCount,
      popularity,
      artistId: updated.artistId
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getSongMetricsBySqlIds(sqlSongIds: number[]): Promise<Map<number, SongMetricRow>> {
  const ids = Array.from(new Set(sqlSongIds.filter((id) => Number.isFinite(id) && id > 0).map((id) => Math.floor(id))));
  const metrics = new Map<number, SongMetricRow>();

  if (ids.length === 0) {
    return metrics;
  }

  const result = await getPool().query<{
    sqlSongId: number;
    totalViews: number;
    likeCount: number;
    popularity: number;
    artistId: number | null;
  }>(
    `
      SELECT
        s.id AS "sqlSongId",
        COALESCE(s.total_views, 0)::INT AS "totalViews",
        COALESCE(s.like_count, 0)::INT AS "likeCount",
        COALESCE(s.popularity, 0)::INT AS "popularity",
        s.artist_id AS "artistId"
      FROM songs s
      WHERE s.id = ANY($1::INT[]);
    `,
    [ids]
  );

  result.rows.forEach((row) => {
    metrics.set(row.sqlSongId, {
      sqlSongId: row.sqlSongId,
      totalViews: row.totalViews,
      likeCount: row.likeCount,
      popularity: row.popularity,
      artistId: row.artistId
    });
  });

  return metrics;
}

export async function addVersionsToExistingSong(sqlSongId: number, versions: VersionInput[]): Promise<CloudSqlSongVersionRow[]> {
  if (!Array.isArray(versions) || versions.length === 0) {
    return [];
  }

  const client = await getPool().connect();
  const inserted: CloudSqlSongVersionRow[] = [];

  try {
    await client.query('BEGIN');

    const songCheck = await client.query<{ id: number }>('SELECT id FROM songs WHERE id = $1 LIMIT 1;', [sqlSongId]);
    if (!songCheck.rows.length) {
      throw new Error(`Cloud SQL song not found for id=${sqlSongId}.`);
    }

    for (const vi of versions) {
      const instrumentName = (vi.instrumentName ?? 'Letra').trim() || 'Letra';
      const instrumentResult = await client.query<{ id: number; name: string }>(
        `
          INSERT INTO instruments (name)
          VALUES ($1)
          ON CONFLICT ((lower(name))) DO UPDATE SET name = instruments.name
          RETURNING id, name;
        `,
        [instrumentName]
      );

      if (!instrumentResult.rows.length) {
        throw new Error(`Cloud SQL instrument upsert returned no rows for instrument '${instrumentName}'.`);
      }

      const instrumentRow = instrumentResult.rows[0];
      const versionResult = await client.query<{
        id: number;
        versionName: string;
        instrumentId: number | null;
        artistId: number | null;
        audioReferenceUrl: string | null;
      }>(
        `
          INSERT INTO song_versions (
            song_id,
            artist_id,
            instrument_id,
            version_name,
            tone,
            notation_type,
            audio_reference_url,
            is_premium
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
          RETURNING
            id,
            version_name AS "versionName",
            instrument_id AS "instrumentId",
            artist_id AS "artistId",
            audio_reference_url AS "audioReferenceUrl";
        `,
        [
          sqlSongId,
          vi.artistId ?? null,
          instrumentRow.id,
          (vi.versionName ?? 'Versión 1').trim() || 'Versión 1',
          vi.tone ?? null,
          vi.notationType ?? null,
          vi.audioReferenceUrl ?? null
        ]
      );

      if (!versionResult.rows.length) {
        throw new Error('Cloud SQL song version insert returned no rows.');
      }

      inserted.push({
        ...versionResult.rows[0],
        instrumentName: instrumentRow.name,
        artistName: vi.artistName ?? null
      });
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteVersionsByIdsInCloudSql(versionIds: number[]): Promise<void> {
  const ids = versionIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return;
  await getPool().query('DELETE FROM song_versions WHERE id = ANY($1::int[]);', [ids]);
}

export async function createRepertoireInCloudSql(input: CreateRepertoireInCloudSqlInput): Promise<CloudSqlRepertoireRow> {
  const client = await getPool().connect();

  const safeEmail = (() => {
    const candidate = typeof input.userEmail === 'string' ? input.userEmail.trim().toLowerCase() : '';
    return candidate || `${input.firebaseUid}@firebase.local`;
  })();

  const safeName = (() => {
    const candidate = typeof input.userName === 'string' ? input.userName.trim() : '';
    return candidate || safeEmail.split('@')[0] || `user-${input.firebaseUid.slice(0, 8)}`;
  })();

  const uniqueSongIds = Array.from(new Set(
    input.songIds
      .filter((songId) => Number.isFinite(songId) && songId > 0)
      .map((songId) => Math.floor(songId))
  ));

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{ id: number }>(
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
      [input.firebaseUid, safeName, safeEmail]
    );

    if (!userResult.rows.length) {
      throw new Error('Cloud SQL user lookup/upsert returned no rows while creating repertoire.');
    }

    const userId = userResult.rows[0].id;
    const repertoireResult = await client.query<CloudSqlRepertoireRow>(
      `
        INSERT INTO repertoires (user_id, title, type)
        VALUES ($1, $2, $3)
        RETURNING id;
      `,
      [userId, input.title, input.liturgicalType ?? null]
    );

    if (!repertoireResult.rows.length) {
      throw new Error('Cloud SQL repertoire insert returned no rows.');
    }

    const repertoireId = repertoireResult.rows[0].id;

    for (let index = 0; index < uniqueSongIds.length; index += 1) {
      await client.query(
        `
          INSERT INTO repertoire_songs (repertoire_id, song_id, order_index)
          VALUES ($1, $2, $3)
          ON CONFLICT (repertoire_id, order_index)
          DO UPDATE SET song_id = EXCLUDED.song_id;
        `,
        [repertoireId, uniqueSongIds[index], index]
      );
    }

    await client.query('COMMIT');
    return { id: repertoireId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function searchSongsForRepertoire(query: string, limit: number = 12): Promise<RepertoireSongSearchRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 30) : 12;
  const numericQuery = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  const result = await getPool().query<RepertoireSongSearchRow>(
    `
      WITH song_candidates AS (
        SELECT
          s.id AS song_id,
          NULL::INT AS version_id,
          s.title AS song_title,
          sa.id AS song_artist_id,
          sa.name AS song_artist_name,
          NULL::VARCHAR(150) AS version_name,
          NULL::INT AS version_artist_id,
          NULL::VARCHAR(150) AS version_artist_name,
          NULL::VARCHAR(100) AS instrument_name,
          'song'::TEXT AS match_type
        FROM songs s
        LEFT JOIN artists sa ON sa.id = s.artist_id
        WHERE
          s.title ILIKE $1
          OR COALESCE(sa.name, '') ILIKE $1
          OR ($2::INT IS NOT NULL AND s.id = $2)
      ),
      version_candidates AS (
        SELECT
          s.id AS song_id,
          sv.id AS version_id,
          s.title AS song_title,
          sa.id AS song_artist_id,
          sa.name AS song_artist_name,
          sv.version_name,
          va.id AS version_artist_id,
          va.name AS version_artist_name,
          i.name AS instrument_name,
          'version'::TEXT AS match_type
        FROM songs s
        INNER JOIN song_versions sv ON sv.song_id = s.id
        LEFT JOIN artists sa ON sa.id = s.artist_id
        LEFT JOIN artists va ON va.id = sv.artist_id
        LEFT JOIN instruments i ON i.id = sv.instrument_id
        WHERE
          s.title ILIKE $1
          OR COALESCE(sa.name, '') ILIKE $1
          OR COALESCE(va.name, '') ILIKE $1
          OR COALESCE(sv.version_name, '') ILIKE $1
          OR ($2::INT IS NOT NULL AND s.id = $2)
          OR ($2::INT IS NOT NULL AND sv.id = $2)
      )
      SELECT
        c.song_id AS "songId",
        c.version_id AS "versionId",
        c.song_title AS "songTitle",
        c.song_artist_id AS "songArtistId",
        c.song_artist_name AS "songArtistName",
        c.version_name AS "versionName",
        c.version_artist_id AS "versionArtistId",
        c.version_artist_name AS "versionArtistName",
        c.instrument_name AS "instrumentName",
        c.match_type AS "matchType"
      FROM (
        SELECT * FROM song_candidates
        UNION ALL
        SELECT * FROM version_candidates
      ) c
      ORDER BY
        CASE
          WHEN $2::INT IS NOT NULL AND c.version_id = $2 THEN 0
          WHEN $2::INT IS NOT NULL AND c.song_id = $2 THEN 1
          WHEN c.song_title ILIKE $3 THEN 2
          WHEN COALESCE(c.song_artist_name, '') ILIKE $3 OR COALESCE(c.version_artist_name, '') ILIKE $3 THEN 3
          WHEN COALESCE(c.version_name, '') ILIKE $3 THEN 4
          ELSE 5
        END,
        c.song_title ASC,
        c.version_name ASC NULLS FIRST,
        c.song_id ASC,
        c.version_id ASC NULLS FIRST
      LIMIT $4;
    `,
    [`%${trimmed}%`, numericQuery, `${trimmed}%`, safeLimit]
  );

  return result.rows;
}

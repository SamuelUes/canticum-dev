import { type Pool } from 'pg';
import { getSharedPool, withPoolRetry } from './pool';

export interface InstrumentationInput {
  instrumentationId?: string | null;
  instrumentName: string;
  lyrics?: string | null;
  lyricsFileUrl?: string | null;
  sheetFileUrl?: string | null;
  audioReferenceUrl?: string | null;
  tone?: string | null;
  notationType?: string | null;
}

export interface VersionInput {
  versionName: string;
  artistId?: number | null;
  artistName?: string | null;
  audioMode: 'shared' | 'per_instrumentation';
  audioReferenceUrl?: string | null;
  instrumentations: InstrumentationInput[];
  // Legacy fields for backward compatibility
  instrumentName?: string;
  tone?: string | null;
  notationType?: string | null;
}
/*------*/
export interface UpdateSongMetadataInput {
  sqlSongId: number;
  title?: string;
  coverImageUrl?: string | null;
  status?: string | null;
}

export async function updateSongMetadataInCloudSql(input: UpdateSongMetadataInput): Promise<void> {
  const songId = Number(input.sqlSongId);
  if (!Number.isFinite(songId) || songId <= 0) {
    return;
  }

  const assignments: string[] = [];
  const values: unknown[] = [songId];
  let cursor = 2;

  if (typeof input.title === 'string' && input.title.trim().length > 0) {
    assignments.push(`title = $${cursor}`);
    values.push(input.title.trim());
    cursor += 1;
  }

  if (input.coverImageUrl !== undefined) {
    assignments.push(`images_json = $${cursor}::jsonb`);
    const normalizedCover = typeof input.coverImageUrl === 'string' && input.coverImageUrl.trim().length > 0
      ? JSON.stringify([{ url: input.coverImageUrl.trim(), width: 480, height: 480 }])
      : '[]';
    values.push(normalizedCover);
    cursor += 1;
  }

  if (typeof input.status === 'string' && input.status.trim().length > 0) {
    assignments.push(`state_id = COALESCE((SELECT id FROM song_states WHERE code = UPPER($${cursor}) LIMIT 1), state_id)`);
    values.push(input.status.trim().toUpperCase());
    cursor += 1;
  }

  if (assignments.length === 0) {
    return;
  }

  const query = `UPDATE songs SET ${assignments.join(', ')} WHERE id = $1;`;
  await getPool().query(query, values);
}

export interface UpdateSongVersionInput {
  sqlSongVersionId: number;
  versionName?: string;
  instrumentName?: string | null;
  tone?: string | null;
  notationType?: string | null;
  audioReferenceUrl?: string | null;
}

export async function updateSongVersionInCloudSql(input: UpdateSongVersionInput): Promise<void> {
  const versionId = Number(input.sqlSongVersionId);
  if (!Number.isFinite(versionId) || versionId <= 0) {
    return;
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const assignments: string[] = [];
    const values: unknown[] = [versionId];
    let cursor = 2;

    if (typeof input.versionName === 'string' && input.versionName.trim().length > 0) {
      assignments.push(`version_name = $${cursor}`);
      values.push(input.versionName.trim());
      cursor += 1;
    }

    if (input.instrumentName !== undefined) {
      let instrumentId: number | null = null;
      if (typeof input.instrumentName === 'string' && input.instrumentName.trim().length > 0) {
        const instrumentResult = await client.query<{ id: number }>(
          `
            INSERT INTO instruments (name)
            VALUES ($1)
            ON CONFLICT ((lower(name))) DO UPDATE SET name = instruments.name
            RETURNING id;
          `,
          [input.instrumentName.trim()]
        );
        instrumentId = instrumentResult.rows[0]?.id ?? null;
      }

      assignments.push(`instrument_id = $${cursor}`);
      values.push(instrumentId);
      cursor += 1;
    }

    if (input.tone !== undefined) {
      assignments.push(`tone = $${cursor}`);
      values.push(input.tone ?? null);
      cursor += 1;
    }

    if (input.notationType !== undefined) {
      assignments.push(`notation_type = $${cursor}`);
      values.push(input.notationType ?? null);
      cursor += 1;
    }

    if (input.audioReferenceUrl !== undefined) {
      assignments.push(`audio_reference_url = $${cursor}`);
      values.push(input.audioReferenceUrl ?? null);
      cursor += 1;
    }

    if (assignments.length > 0) {
      const query = `UPDATE song_versions SET ${assignments.join(', ')} WHERE id = $1;`;
      await client.query(query, values);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
/*------*/

export interface UserSongStatusCountRow {
  status: string;
  total: number;
}

export async function countSongsByStatusForUser(firebaseUid: string): Promise<UserSongStatusCountRow[]> {
  const query = `
    SELECT
      UPPER(COALESCE(ss.code, 'DRAFT')) AS "status",
      COUNT(*)::INT AS "total"
    FROM songs s
    INNER JOIN users u ON u.id = s.user_id
    LEFT JOIN song_states ss ON ss.id = s.state_id
    WHERE u.firebase_uid = $1
    GROUP BY 1;
  `;

  const result = await getPool().query<{ status: string | null; total: number }>(query, [firebaseUid]);
  return result.rows.map((row) => ({
    status: (row.status ?? 'DRAFT').toUpperCase(),
    total: Number.isFinite(row.total) ? Number(row.total) : 0
  }));
}

interface CreateSongDraftCloudSqlInput {
  firebaseUid: string;
  title: string;
  year?: number | null;
  liturgicalUse?: string | null;
  liturgicalTime?: string | null;
  filePath?: string | null;
  previewUrl?: string | null;
  artistId?: number | null;
  coverImageUrl?: string | null;
  durationMs?: number | null;
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
  audioMode?: string | null;
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
  coverUrl?: string | null;
  songIds: number[];
  userEmail?: string | null;
  userName?: string | null;
}

interface CloudSqlRepertoireRow {
  id: number;
}

function getPool(): Pool {
  return getSharedPool();
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
    : [{ versionName: 'Versión 1', audioMode: 'shared' as const, instrumentations: [{ instrumentName: 'Letra' }] }];
  const normalizedCoverUrl = typeof input.coverImageUrl === 'string' && input.coverImageUrl.trim().length > 0
    ? input.coverImageUrl.trim()
    : null;
  const imagesJson = normalizedCoverUrl
    ? [{ url: normalizedCoverUrl, width: 480, height: 480 }]
    : [];

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
INSERT INTO songs (
  user_id,
  state_id,
  title,
  year,
  liturgical_use,
  liturgical_time,
  file_path,
  preview_url,
  artist_id,
  images_json,
  duration_ms
)
SELECT
  user_row.id,
  state_row.id,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9::jsonb,
  $10
FROM user_row, state_row
RETURNING
  id,
  user_id AS "userId",
  state_id AS "stateId",
  title,
  artist_id AS "artistId";
    `;

    const songResult = await client.query<Omit<CloudSqlSongDraftRow, 'versions'>>(songInsertQuery, [
      input.firebaseUid,
      input.title,
      typeof input.year === 'number' ? input.year : null,
      input.liturgicalUse ?? null,
      input.liturgicalTime ?? null,
      input.filePath ?? '',
      input.previewUrl ?? null,
      input.artistId ?? null,
      JSON.stringify(imagesJson),
      typeof input.durationMs === 'number' && input.durationMs > 0 ? input.durationMs : null
    ]);

    if (!songResult.rows.length) {
      throw new Error('Cloud SQL song draft insert returned no rows. Verify users.firebase_uid and song_states seed data.');
    }

    const songRow = songResult.rows[0];
    const versions: CloudSqlSongVersionRow[] = [];

    for (const vi of versionInputs) {
      // Check if this is a legacy version (has instrumentName directly)
      const isLegacy = 'instrumentName' in vi && typeof vi.instrumentName === 'string';

      if (isLegacy) {
        // Legacy mode: create version with direct instrument reference
        const legacyVi = vi as { versionName: string; instrumentName: string; artistId?: number | null; artistName?: string | null; tone?: string | null; notationType?: string | null; audioReferenceUrl?: string | null };
        const instrumentName = (legacyVi.instrumentName ?? 'Letra').trim() || 'Letra';

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

        const instrumentId = instrumentResult.rows[0].id;
        const versionArtistId = legacyVi.artistId ?? null;

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
            instrumentId,
            (legacyVi.versionName ?? 'Versión 1').trim() || 'Versión 1',
            legacyVi.tone ?? null,
            legacyVi.notationType ?? null,
            legacyVi.audioReferenceUrl ?? null
          ]
        );

        if (!versionResult.rows.length) {
          throw new Error('Cloud SQL song version insert returned no rows.');
        }

        versions.push({
          ...versionResult.rows[0],
          instrumentName,
          artistName: legacyVi.artistName ?? null
        });
      } else {
        // New mode: create version with audio_mode and instrumentations
        const newVi = vi as VersionInput;
        const versionArtistId = newVi.artistId ?? null;
        const audioMode = newVi.audioMode ?? 'shared';

        const versionResult = await client.query<{ id: number; versionName: string; instrumentId: number | null; artistId: number | null; audioReferenceUrl: string | null }>(
          `
            INSERT INTO song_versions (
              song_id,
              artist_id,
              version_name,
              audio_mode,
              audio_reference_url,
              is_premium
            )
            VALUES ($1, $2, $3, $4, $5, FALSE)
            RETURNING id, version_name AS "versionName", NULL::INT AS "instrumentId", artist_id AS "artistId", audio_reference_url AS "audioReferenceUrl";
          `,
          [
            songRow.id,
            versionArtistId,
            (newVi.versionName ?? 'Versión 1').trim() || 'Versión 1',
            audioMode,
            audioMode === 'shared' ? (newVi.audioReferenceUrl ?? null) : null
          ]
        );

        if (!versionResult.rows.length) {
          throw new Error('Cloud SQL song version insert returned no rows.');
        }

        const versionId = versionResult.rows[0].id;

        // Insert instrumentations
        for (const inst of newVi.instrumentations) {
          const instName = (inst.instrumentName ?? 'Letra').trim() || 'Letra';

          const instrumentResult = await client.query<{ id: number; name: string }>(
            `
              INSERT INTO instruments (name)
              VALUES ($1)
              ON CONFLICT ((lower(name))) DO UPDATE SET name = instruments.name
              RETURNING id, name;
            `,
            [instName]
          );

          if (!instrumentResult.rows.length) {
            throw new Error(`Cloud SQL instrument upsert returned no rows for instrument '${instName}'.`);
          }

          const instrumentId = instrumentResult.rows[0].id;

          await client.query(
            `
              INSERT INTO song_version_instrumentations (
                song_version_id,
                instrument_id,
                instrument_name,
                lyrics,
                lyrics_file_url,
                sheet_file_url,
                audio_reference_url,
                tone,
                notation_type
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
            `,
            [
              versionId,
              instrumentId,
              instName,
              inst.lyrics ?? null,
              inst.lyricsFileUrl ?? null,
              inst.sheetFileUrl ?? null,
              audioMode === 'per_instrumentation' ? (inst.audioReferenceUrl ?? null) : null,
              inst.tone ?? null,
              inst.notationType ?? null
            ]
          );
        }

        versions.push({
          ...versionResult.rows[0],
          instrumentName: null,
          artistName: newVi.artistName ?? null
        });
      }
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

export async function listSongIdsCreatedBefore(date: Date): Promise<number[]> {
  const result = await getPool().query<{ id: number }>(
    `
      SELECT id
      FROM songs
      WHERE created_at < $1
      ORDER BY created_at ASC;
    `,
    [date]
  );
  return result.rows.map((row) => row.id);
}

export async function bulkDeleteSongsByIds(songIds: number[]): Promise<{ deletedCount: number; errors: string[] }> {
  const client = await getPool().connect();
  const errors: string[] = [];
  let deletedCount = 0;

  try {
    await client.query('BEGIN');

    for (const songId of songIds) {
      try {
        const result = await client.query('DELETE FROM songs WHERE id = $1 RETURNING id;', [songId]);
        if (result.rowCount && result.rowCount > 0) {
          deletedCount++;
        }
      } catch (error) {
        errors.push(`Failed to delete song ${songId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await client.query('COMMIT');
    return { deletedCount, errors };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface ArtistSongVersionRow {
  id: number;
  songId: number;
  versionName: string;
  artistId: number | null;
}

export interface ArtistSongRow {
  id: number;
  title: string;
  liturgicalUse: string | null;
  year: number | null;
  ownerFirebaseUid: string | null;
  status: string | null;
  reviewStatus: 'reviewed' | 'pending';
  versions?: ArtistSongVersionRow[];
}

export async function listSongsByArtistId(
  artistId: number,
  limit: number = 50,
  viewerFirebaseUid?: string | null
): Promise<ArtistSongRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const result = await getPool().query<ArtistSongRow>(
    `
      SELECT
        s.id AS "id",
        s.title AS "title",
        s.liturgical_use AS "liturgicalUse",
        s.liturgical_time AS "liturgicalTime",
        s.year AS "year",
        u.firebase_uid AS "ownerFirebaseUid",
        ss.code AS "status",
        CASE
          WHEN UPPER(COALESCE(ss.code, '')) = 'APPROVED' THEN 'reviewed'
          ELSE 'pending'
        END AS "reviewStatus"
      FROM songs s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN song_states ss ON ss.id = s.state_id
      WHERE s.artist_id = $1
        AND (
          ss.id IS NULL
          OR UPPER(COALESCE(ss.code, '')) IN ('PUBLISHED', 'APPROVED')
          OR (
            UPPER(COALESCE(ss.code, '')) = 'DRAFT'
            AND $3::TEXT IS NOT NULL
            AND u.firebase_uid = $3::TEXT
          )
        )
      ORDER BY s.title ASC, s.id ASC
      LIMIT $2;
    `,
    [artistId, safeLimit, viewerFirebaseUid ?? null]
  );
  return result.rows;
}

export async function listSongVersionsByArtistId(
  artistId: number,
  limit: number = 100,
  viewerFirebaseUid?: string | null
): Promise<ArtistSongRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 100;
  const result = await getPool().query<ArtistSongRow>(
    `
      SELECT
        s.id AS "id",
        s.title AS "title",
        s.liturgical_use AS "liturgicalUse",
        s.liturgical_time AS "liturgicalTime",
        s.year AS "year",
        u.firebase_uid AS "ownerFirebaseUid",
        ss.code AS "status",
        CASE
          WHEN UPPER(COALESCE(ss.code, '')) = 'APPROVED' THEN 'reviewed'
          ELSE 'pending'
        END AS "reviewStatus"
      FROM songs s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN song_states ss ON ss.id = s.state_id
      WHERE s.artist_id = $1
        AND (
          ss.id IS NULL
          OR UPPER(COALESCE(ss.code, '')) IN ('PUBLISHED', 'APPROVED')
          OR (
            UPPER(COALESCE(ss.code, '')) = 'DRAFT'
            AND $3::TEXT IS NOT NULL
            AND u.firebase_uid = $3::TEXT
          )
        )
      ORDER BY s.title ASC, s.id ASC
      LIMIT $2;
    `,
    [artistId, safeLimit, viewerFirebaseUid ?? null]
  );

  if (result.rows.length === 0) {
    return [];
  }

  const songIds = result.rows.map((r) => r.id);
  const versionResult = await getPool().query<ArtistSongVersionRow>(
    `
      SELECT
        sv.id AS "id",
        sv.song_id AS "songId",
        sv.version_name AS "versionName",
        sv.artist_id AS "artistId"
      FROM song_versions sv
      WHERE sv.song_id = ANY($1::INT[])
      ORDER BY sv.id ASC;
    `,
    [songIds]
  );

  const versionsBySong = new Map<number, ArtistSongVersionRow[]>();
  for (const v of versionResult.rows) {
    const list = versionsBySong.get(v.songId) ?? [];
    list.push(v);
    versionsBySong.set(v.songId, list);
  }

  return result.rows.map((row) => ({
    ...row,
    versions: versionsBySong.get(row.id) ?? []
  }));
}

export async function listSongVersionsBySongIds(sqlSongIds: number[]): Promise<Map<number, ArtistSongVersionRow[]>> {
  if (sqlSongIds.length === 0) {
    return new Map();
  }

  const result = await getPool().query<ArtistSongVersionRow>(
    `
      SELECT
        sv.id AS "id",
        sv.song_id AS "songId",
        sv.version_name AS "versionName",
        sv.artist_id AS "artistId"
      FROM song_versions sv
      WHERE sv.song_id = ANY($1::INT[])
      ORDER BY sv.id ASC;
    `,
    [sqlSongIds]
  );

  const versionsBySong = new Map<number, ArtistSongVersionRow[]>();
  for (const v of result.rows) {
    const list = versionsBySong.get(v.songId) ?? [];
    list.push(v);
    versionsBySong.set(v.songId, list);
  }

  return versionsBySong;
}

export async function getSongVersionInfo(versionId: number): Promise<{ id: number; songId: number; versionName: string } | null> {
  const result = await getPool().query<{ id: number; songId: number; versionName: string }>(
    `
      SELECT
        sv.id AS "id",
        sv.song_id AS "songId",
        sv.version_name AS "versionName"
      FROM song_versions sv
      WHERE sv.id = $1
      LIMIT 1;
    `,
    [versionId]
  );

  return result.rows[0] ?? null;
}

export async function refreshFeaturedSongsSnapshot(limit: number = 50, snapshotWeek?: string): Promise<FeaturedSongSnapshotRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const normalizedWeek = typeof snapshotWeek === 'string' && snapshotWeek.trim().length > 0
    ? snapshotWeek.trim()
    : null;

  let query: string;
  let params: (number | string | null)[];

  if (normalizedWeek === null) {
    // When no week specified, use default parameter in SQL function
    query = `
      SELECT
        snapshot_week,
        rank_position,
        song_id,
        score,
        popularity,
        total_views,
        like_count
      FROM refresh_featured_songs_snapshot($1);
    `;
    params = [safeLimit];
  } else {
    // When week specified, pass both parameters
    query = `
      SELECT
        snapshot_week,
        rank_position,
        song_id,
        score,
        popularity,
        total_views,
        like_count
      FROM refresh_featured_songs_snapshot($1, $2);
    `;
    params = [safeLimit, normalizedWeek];
  }

  const refreshResult = await getPool().query<{
    snapshot_week: Date;
    rank_position: number;
    song_id: number;
    score: string;
    popularity: number;
    total_views: number;
    like_count: number;
  }>(query, params);

  const ids = Array.from(new Set(refreshResult.rows.map((row) => row.song_id).filter((id) => Number.isFinite(id) && id > 0)));

  if (ids.length === 0) {
    return [];
  }

  const metadataResult = await getPool().query<{
    sqlSongId: number;
    title: string;
    artistId: number | null;
    artistName: string | null;
  }>(
    `
      SELECT
        s.id AS "sqlSongId",
        s.title AS "title",
        s.artist_id AS "artistId",
        a.name AS "artistName"
      FROM songs s
      LEFT JOIN artists a ON a.id = s.artist_id
      WHERE s.id = ANY($1::INT[]);
    `,
    [ids]
  );

  const metadataBySongId = new Map<number, { title: string; artistId: number | null; artistName: string | null }>();
  metadataResult.rows.forEach((row) => {
    metadataBySongId.set(row.sqlSongId, {
      title: row.title,
      artistId: row.artistId,
      artistName: row.artistName
    });
  });

  return refreshResult.rows.map((row) => {
    const meta = metadataBySongId.get(row.song_id);
    return {
      snapshotWeek: row.snapshot_week.toISOString().slice(0, 10),
      rankPosition: row.rank_position,
      sqlSongId: row.song_id,
      title: meta?.title ?? `Song ${row.song_id}`,
      artistId: meta?.artistId ?? null,
      artistName: meta?.artistName ?? null,
      score: Number(row.score),
      popularity: row.popularity,
      totalViews: row.total_views,
      likeCount: row.like_count
    };
  });
}

export async function listFeaturedSongsSnapshot(limit: number = 50, snapshotWeek?: string): Promise<FeaturedSongSnapshotRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const normalizedWeek = typeof snapshotWeek === 'string' && snapshotWeek.trim().length > 0
    ? snapshotWeek.trim()
    : null;

  const result = await getPool().query<FeaturedSongSnapshotRow>(
    `
      WITH latest_week AS (
        SELECT MAX(snapshot_week) AS max_week FROM featured_songs
      )
      SELECT
        fs.snapshot_week::TEXT AS "snapshotWeek",
        fs.rank_position AS "rankPosition",
        fs.song_id AS "sqlSongId",
        s.title AS "title",
        s.artist_id AS "artistId",
        a.name AS "artistName",
        fs.score::FLOAT AS "score",
        fs.popularity AS "popularity",
        fs.total_views AS "totalViews",
        fs.like_count AS "likeCount"
      FROM featured_songs fs
      INNER JOIN songs s ON s.id = fs.song_id
      LEFT JOIN artists a ON a.id = s.artist_id
      CROSS JOIN latest_week lw
      WHERE fs.snapshot_week = COALESCE($2::DATE, lw.max_week)
      ORDER BY fs.rank_position ASC
      LIMIT $1;
    `,
    [safeLimit, normalizedWeek]
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

export interface TopSongRow {
  sqlSongId: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  totalViews: number;
  likeCount: number;
  popularity: number;
  durationMs?: number;
}

export interface FeaturedSongSnapshotRow {
  snapshotWeek: string;
  rankPosition: number;
  sqlSongId: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  score: number;
  popularity: number;
  totalViews: number;
  likeCount: number;
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
  const [aggregate, currentArtist] = await Promise.all([
    client.query<{ totalViews: number }>(
      `
        SELECT
          COALESCE(SUM(song_metrics.total_views), 0)::INT AS "totalViews"
        FROM (
          SELECT DISTINCT
            s.id,
            COALESCE(s.total_views, 0)::INT AS total_views
          FROM songs s
          LEFT JOIN song_versions sv ON sv.song_id = s.id
          WHERE s.artist_id = $1
            OR sv.artist_id = $1
        ) AS song_metrics;
      `,
      [artistId]
    ),
    client.query<{ totalViews: number; likeCount: number }>(
      `
        SELECT
          COALESCE(total_views, 0)::INT AS "totalViews",
          COALESCE(like_count, 0)::INT AS "likeCount"
        FROM artists
        WHERE id = $1
        LIMIT 1;
      `,
      [artistId]
    )
  ]);

  const aggregateViews = Number(aggregate.rows[0]?.totalViews ?? 0);
  const currentViews = Number(currentArtist.rows[0]?.totalViews ?? 0);
  const currentLikes = Number(currentArtist.rows[0]?.likeCount ?? 0);
  const resolvedViews = Math.max(aggregateViews, currentViews, 0);
  const popularity = computeArtistPopularity(resolvedViews, currentLikes);

  await client.query(
    `
      UPDATE artists
      SET
        total_views = $2,
        popularity = $3
      WHERE id = $1;
    `,
    [artistId, resolvedViews, popularity]
  );
}

export async function refreshArtistSuggestionsSnapshot(limitPerArtist: number = 12): Promise<number> {
  const safeLimit = Number.isFinite(limitPerArtist)
    ? Math.min(Math.max(Math.floor(limitPerArtist), 1), 50)
    : 12;

  const result = await getPool().query<{ inserted: number }>(
    `
      WITH user_artist_signals AS (
        SELECT
          al.user_id AS user_id,
          al.artist_id AS artist_id,
          1.0::NUMERIC AS weight
        FROM artist_likes al

        UNION ALL

        SELECT
          f.user_id AS user_id,
          COALESCE(s.artist_id, sv_artist.artist_id) AS artist_id,
          0.7::NUMERIC AS weight
        FROM favorites f
        INNER JOIN songs s ON s.id = f.song_id
        LEFT JOIN LATERAL (
          SELECT sv.artist_id
          FROM song_versions sv
          WHERE sv.song_id = s.id
            AND sv.artist_id IS NOT NULL
          ORDER BY sv.id ASC
          LIMIT 1
        ) sv_artist ON TRUE
        WHERE COALESCE(s.artist_id, sv_artist.artist_id) IS NOT NULL
      ),
      aggregated AS (
        SELECT
          uas.user_id,
          uas.artist_id,
          SUM(uas.weight)::NUMERIC AS affinity
        FROM user_artist_signals uas
        GROUP BY uas.user_id, uas.artist_id
      ),
      paired AS (
        SELECT
          a1.artist_id AS artist_id,
          a2.artist_id AS suggested_artist_id,
          COUNT(*)::INT AS overlap_users,
          SUM(LEAST(a1.affinity, a2.affinity))::NUMERIC AS overlap_score
        FROM aggregated a1
        INNER JOIN aggregated a2
          ON a1.user_id = a2.user_id
         AND a1.artist_id <> a2.artist_id
        GROUP BY a1.artist_id, a2.artist_id
      ),
      ranked AS (
        SELECT
          p.artist_id,
          p.suggested_artist_id,
          ROUND(
            p.overlap_score * 10
            + LOG(10, COALESCE(a.total_views, 0) + 1) * 2
            + LOG(10, COALESCE(a.like_count, 0) + 1) * 3,
            2
          ) AS relevance_score,
          ROW_NUMBER() OVER (
            PARTITION BY p.artist_id
            ORDER BY
              p.overlap_score DESC,
              p.overlap_users DESC,
              COALESCE(a.popularity, 0) DESC,
              p.suggested_artist_id ASC
          ) AS row_num
        FROM paired p
        INNER JOIN artists a ON a.id = p.suggested_artist_id
      ),
      deleted AS (
        DELETE FROM artist_suggestions
      ),
      inserted_rows AS (
        INSERT INTO artist_suggestions (artist_id, suggested_artist_id, relevance_score)
        SELECT
          r.artist_id,
          r.suggested_artist_id,
          r.relevance_score
        FROM ranked r
        WHERE r.row_num <= $1
          AND r.relevance_score > 0
        ON CONFLICT (artist_id, suggested_artist_id)
        DO UPDATE SET
          relevance_score = EXCLUDED.relevance_score,
          created_at = CURRENT_TIMESTAMP
        RETURNING 1
      )
      SELECT COUNT(*)::INT AS inserted
      FROM inserted_rows;
    `,
    [safeLimit]
  );

  return result.rows[0]?.inserted ?? 0;
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

    const userId = await ensureCloudSqlUserByFirebaseUid(firebaseUid, client);
    if (!userId) {
      await client.query('ROLLBACK');
      return null;
    }

    const aggregateResult = await client.query<{
      id: number;
      totalViews: number;
      likeCount: number;
      artistId: number | null;
    }>(
      `
        WITH song_update AS (
          UPDATE songs s
          SET 
            like_count = (
              SELECT COUNT(*)::INT
              FROM favorites f
              WHERE f.song_id = s.id
            ),
            popularity = compute_song_popularity(
              COALESCE(s.total_views, 0),
              (
                SELECT COUNT(*)::INT
                FROM favorites f
                WHERE f.song_id = s.id
              )
            )
          WHERE s.id = $1
          RETURNING
            s.id,
            COALESCE(s.total_views, 0)::INT AS "totalViews",
            COALESCE(s.like_count, 0)::INT AS "likeCount",
            s.artist_id AS "artistId"
        )
        ${isFavorite 
          ? `INSERT INTO favorites (user_id, song_id) VALUES ($2, $1) ON CONFLICT (user_id, song_id) DO NOTHING`
          : `DELETE FROM favorites WHERE user_id = $2 AND song_id = $1`
        };
        SELECT * FROM song_update;
      `,
      [sqlSongId, userId]
    );

    if (!aggregateResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const updated = aggregateResult.rows[0];

    if (updated.artistId && Number.isFinite(updated.artistId)) {
      await syncArtistMetricsById(updated.artistId, client);
    }

    await client.query('COMMIT');

    return {
      sqlSongId,
      totalViews: updated.totalViews,
      likeCount: updated.likeCount,
      popularity: computeSongPopularity(updated.totalViews, updated.likeCount),
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
  return withPoolRetry(async () => {
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
  });
}

export async function listTopSongs(limit: number = 50): Promise<TopSongRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const result = await getPool().query<TopSongRow>(
    `
      SELECT
        s.id AS "sqlSongId",
        s.title AS "title",
        s.artist_id AS "artistId",
        a.name AS "artistName",
        COALESCE(s.total_views, 0)::INT AS "totalViews",
        COALESCE(s.like_count, 0)::INT AS "likeCount",
        COALESCE(s.popularity, 0)::INT AS "popularity",
        s.duration_ms AS "durationMs"
      FROM songs s
      LEFT JOIN artists a ON a.id = s.artist_id
      LEFT JOIN song_states ss ON ss.id = s.state_id
      WHERE UPPER(COALESCE(ss.code, '')) IN ('APPROVED', 'PUBLISHED')
      ORDER BY
        COALESCE(s.popularity, 0) DESC,
        COALESCE(s.like_count, 0) DESC,
        COALESCE(s.total_views, 0) DESC,
        s.created_at DESC,
        s.id DESC
      LIMIT $1;
    `,
    [safeLimit]
  );

  return result.rows;
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
      const isLegacy = 'instrumentName' in vi && typeof vi.instrumentName === 'string';

      if (isLegacy) {
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
        continue;
      }

      const audioMode = vi.audioMode ?? 'shared';
      const normalizedInstrumentations = Array.isArray(vi.instrumentations) && vi.instrumentations.length > 0
        ? vi.instrumentations
        : [{ instrumentName: vi.instrumentName ?? 'Letra' }];

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
            version_name,
            audio_mode,
            audio_reference_url,
            is_premium
          )
          VALUES ($1, $2, $3, $4, $5, FALSE)
          RETURNING
            id,
            version_name AS "versionName",
            NULL::INT AS "instrumentId",
            artist_id AS "artistId",
            audio_reference_url AS "audioReferenceUrl";
        `,
        [
          sqlSongId,
          vi.artistId ?? null,
          (vi.versionName ?? 'Versión 1').trim() || 'Versión 1',
          audioMode,
          audioMode === 'shared' ? (vi.audioReferenceUrl ?? null) : null
        ]
      );

      if (!versionResult.rows.length) {
        throw new Error('Cloud SQL song version insert returned no rows.');
      }

      const versionId = versionResult.rows[0].id;

      for (const inst of normalizedInstrumentations) {
        const instName = (inst.instrumentName ?? 'Letra').trim() || 'Letra';
        const instrumentResult = await client.query<{ id: number; name: string }>(
          `
            INSERT INTO instruments (name)
            VALUES ($1)
            ON CONFLICT ((lower(name))) DO UPDATE SET name = instruments.name
            RETURNING id, name;
          `,
          [instName]
        );

        if (!instrumentResult.rows.length) {
          throw new Error(`Cloud SQL instrument upsert returned no rows for instrument '${instName}'.`);
        }

        const instrumentId = instrumentResult.rows[0].id;

        await client.query(
          `
            INSERT INTO song_version_instrumentations (
              song_version_id,
              instrument_id,
              instrument_name,
              lyrics,
              lyrics_file_url,
              sheet_file_url,
              audio_reference_url,
              tone,
              notation_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
          `,
          [
            versionId,
            instrumentId,
            instName,
            inst.lyrics ?? null,
            inst.lyricsFileUrl ?? null,
            inst.sheetFileUrl ?? null,
            audioMode === 'per_instrumentation' ? (inst.audioReferenceUrl ?? null) : null,
            inst.tone ?? null,
            inst.notationType ?? null
          ]
        );
      }

      inserted.push({
        ...versionResult.rows[0],
        instrumentName: null,
        artistName: vi.artistName ?? null,
        audioMode
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
        INSERT INTO repertoires (user_id, title, type, cover_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [userId, input.title, input.liturgicalType ?? null, input.coverUrl ?? null]
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

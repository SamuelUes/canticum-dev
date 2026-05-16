import { Pool, type PoolConfig } from 'pg';

export interface CloudSqlArtistRow {
  id: number;
  name: string;
  type: string;
  bio?: string | null;
  imageUrl: string | null;
  images?: Array<{ url: string; width?: number; height?: number }>;
  genres?: string[];
  songsCount?: number;
  likeCount?: number;
  totalViews?: number;
  popularity?: number;
}

export interface ArtistViewMetricRow {
  artistId: number;
  totalViews: number;
  likeCount: number;
  popularity: number;
}

function clampMetricScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeArtistPopularity(totalViews: number, likeCount: number): number {
  const safeViews = Number.isFinite(totalViews) && totalViews > 0 ? totalViews : 0;
  const safeLikes = Number.isFinite(likeCount) && likeCount > 0 ? likeCount : 0;
  const score = Math.log10(safeViews + 1) * 20 + Math.log10(safeLikes + 1) * 10;
  return clampMetricScore(score);
}

export async function incrementArtistViewInCloudSql(artistId: number): Promise<ArtistViewMetricRow | null> {
  const numericArtistId = Number(artistId);
  if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
    return null;
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const incrementResult = await client.query<{
      id: number;
      totalViews: number;
      likeCount: number;
    }>(
      `
        UPDATE artists
        SET total_views = COALESCE(total_views, 0) + 1
        WHERE id = $1
        RETURNING
          id,
          COALESCE(total_views, 0)::INT AS "totalViews",
          COALESCE(like_count, 0)::INT AS "likeCount";
      `,
      [numericArtistId]
    );

    if (!incrementResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const updated = incrementResult.rows[0];
    const popularity = computeArtistPopularity(updated.totalViews, updated.likeCount);

    await client.query(
      `
        UPDATE artists
        SET popularity = $2
        WHERE id = $1;
      `,
      [numericArtistId, popularity]
    );

    await client.query('COMMIT');

    return {
      artistId: numericArtistId,
      totalViews: updated.totalViews,
      likeCount: updated.likeCount,
      popularity
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface CloudSqlArtistSongProfileRow {
  id: string;
  title: string;
  thumbnailUrl?: string;
  views: number;
  tone: string;
  hasLyrics: boolean;
  hasSheet: boolean;
  isVerified?: boolean;
  moderationState?: string;
  reviewStatus?: 'reviewed' | 'pending';
}

export interface CloudSqlArtistDiscographyProfileRow {
  id: string;
  title: string;
  year: number;
  coverUrl?: string;
  albumId?: string;
  songId?: string;
  moderationState?: string;
  reviewStatus?: 'reviewed' | 'pending';
}

export interface CloudSqlSuggestedArtistProfileRow {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface CloudSqlArtistProfileBundle {
  artist: CloudSqlArtistRow;
  songs: CloudSqlArtistSongProfileRow[];
  discography: CloudSqlArtistDiscographyProfileRow[];
  suggestedArtists: CloudSqlSuggestedArtistProfileRow[];
  highlightedSongIds: string[];
}

export interface CloudSqlArtistLikeState {
  isLiked: boolean;
  likeCount: number;
}

let pool: Pool | null = null;

const SQL_TRANSLATE_FROM = 'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç';
const SQL_TRANSLATE_TO = 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc';
const SQL_NAME_SLUG = `regexp_replace(lower(translate(trim(coalesce(name, '')), '${SQL_TRANSLATE_FROM}', '${SQL_TRANSLATE_TO}')), '[^a-z0-9]+', '-', 'g')`;

function toArtistSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type NormalizedImage = { url: string; width?: number; height?: number };

function normalizeImages(raw: unknown): NormalizedImage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
    .map((entry): NormalizedImage | null => {
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      if (!url) {
        return null;
      }
      const width = Number(entry.width);
      const height = Number(entry.height);
      return {
        url,
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined
      };
    })
    .filter((value): value is NormalizedImage => value !== null);
}

function normalizeGenres(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

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
    throw new Error('Invalid Cloud SQL port.');
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

async function resolveCloudSqlUserIdByFirebaseUid(firebaseUid: string): Promise<number | null> {
  const uid = firebaseUid.trim();
  if (!uid) {
    return null;
  }

  const result = await getPool().query<{ id: number }>(
    `
      SELECT id
      FROM users
      WHERE firebase_uid = $1
      LIMIT 1;
    `,
    [uid]
  );

  return result.rows[0]?.id ?? null;
}

export async function searchArtists(query: string, limit: number = 10): Promise<CloudSqlArtistRow[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const result = await getPool().query<CloudSqlArtistRow>(
    `
      SELECT id, name, type, image_url AS "imageUrl"
      FROM artists
      WHERE name ILIKE $1
      ORDER BY popularity DESC NULLS LAST, name ASC
      LIMIT $2;
    `,
    [`%${trimmed}%`, limit]
  );

  return result.rows;
}

export async function getArtistById(artistId: number): Promise<CloudSqlArtistRow | null> {
  const result = await getPool().query<CloudSqlArtistRow>(
    `
      SELECT
        id,
        name,
        type,
        image_url AS "imageUrl",
        COALESCE(like_count, 0)::INT AS "likeCount",
        COALESCE(total_views, 0)::INT AS "totalViews",
        COALESCE(popularity, 0)::INT AS "popularity"
      FROM artists
      WHERE id = $1
      LIMIT 1;
    `,
    [artistId]
  );

  return result.rows[0] ?? null;
}

export async function listTopArtists(limit: number = 30): Promise<CloudSqlArtistRow[]> {
  const result = await getPool().query<CloudSqlArtistRow>(
    `
      SELECT id, name, type, image_url AS "imageUrl"
      FROM artists
      ORDER BY popularity DESC NULLS LAST, name ASC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function findArtistByNameSlug(slug: string): Promise<CloudSqlArtistRow | null> {
  const trimmed = slug.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[-_]+/g, ' ');
  const normalizedSlug = toArtistSlug(trimmed);
  const result = await getPool().query<CloudSqlArtistRow>(
    `
      SELECT
        id,
        name,
        type,
        image_url AS "imageUrl",
        COALESCE(like_count, 0)::INT AS "likeCount",
        COALESCE(total_views, 0)::INT AS "totalViews",
        COALESCE(popularity, 0)::INT AS "popularity"
      FROM artists
      WHERE LOWER(name) = LOWER($1)
         OR LOWER(name) = LOWER($2)
         OR ${SQL_NAME_SLUG} = $3
         OR ${SQL_NAME_SLUG} ILIKE $4
      ORDER BY popularity DESC NULLS LAST, name ASC
      LIMIT 1;
    `,
    [trimmed, normalized, normalizedSlug, `%${normalizedSlug}%`]
  );

  return result.rows[0] ?? null;
}

interface ArtistAlbumDiscographyQueryRow {
  id: number;
  title: string;
  year: number | null;
  coverUrl: string | null;
  albumId: number;
  moderationState: string | null;
  reviewStatus: 'reviewed' | 'pending';
}

function mapAlbumDiscographyRows(rows: ArtistAlbumDiscographyQueryRow[]): CloudSqlArtistDiscographyProfileRow[] {
  return rows.map((row, index) => ({
    id: String(row.id ?? `discography-${index}`),
    title: row.title,
    year: Number.isFinite(row.year) ? Number(row.year) : new Date().getFullYear(),
    coverUrl: row.coverUrl ?? undefined,
    albumId: Number.isFinite(row.albumId) && Number(row.albumId) > 0 ? String(row.albumId) : undefined,
    moderationState: row.moderationState ?? undefined,
    reviewStatus: row.reviewStatus
  }));
}

async function listArtistAlbumDiscographyRows(artistId: number): Promise<ArtistAlbumDiscographyQueryRow[]> {
  const result = await getPool().query<ArtistAlbumDiscographyQueryRow>(
    `
      SELECT
        a.id AS "id",
        a.title AS "title",
        COALESCE(a.release_year, EXTRACT(YEAR FROM a.release_date)::INT) AS "year",
        NULLIF(COALESCE(a.cover_url, a.images_json -> 0 ->> 'url', ''), '') AS "coverUrl",
        a.id AS "albumId",
        NULLIF(UPPER(COALESCE(a.status, '')), '') AS "moderationState",
        CASE
          WHEN UPPER(COALESCE(a.status, '')) IN ('APPROVED', 'PUBLISHED') THEN 'reviewed'
          ELSE 'pending'
        END AS "reviewStatus"
      FROM albums a
      WHERE a.artist_id = $1
        AND (
          a.status IS NULL
          OR UPPER(COALESCE(a.status, '')) IN ('APPROVED', 'PUBLISHED')
        )
      ORDER BY
        COALESCE(a.release_year, EXTRACT(YEAR FROM a.release_date)::INT) DESC NULLS LAST,
        a.id DESC
      LIMIT 20;
    `,
    [artistId]
  );

  return result.rows;
}

export async function listArtistAlbumsByArtistId(artistId: number): Promise<CloudSqlArtistDiscographyProfileRow[]> {
  const rows = await listArtistAlbumDiscographyRows(artistId);
  return mapAlbumDiscographyRows(rows);
}

export async function getArtistProfileBundle(
  artistLookup: string,
  viewerFirebaseUid?: string | null
): Promise<CloudSqlArtistProfileBundle | null> {
  const lookup = artistLookup.trim();
  if (!lookup) {
    return null;
  }

  const numericArtistId = Number.parseInt(lookup, 10);
  const isNumericId = Number.isFinite(numericArtistId) && numericArtistId > 0 && String(numericArtistId) === lookup;

  const artist = isNumericId
    ? await getArtistById(numericArtistId)
    : await findArtistByNameSlug(decodeURIComponent(lookup));

  if (!artist) {
    return null;
  }

  const artistId = artist.id;

  const [artistMetaResult, songsResult, discographyRows, suggestionsResult, featuredResult] = await Promise.all([
    getPool().query<{
      bio: string | null;
      imageUrl: string | null;
      images: unknown;
      genres: unknown;
      totalViews: number | null;
      likeCount: number | null;
      popularity: number | null;
      likesFromTable: number;
    }>(
      `
        SELECT
          a.bio AS "bio",
          a.image_url AS "imageUrl",
          a.images_json AS "images",
          a.genres_json AS "genres",
          a.total_views AS "totalViews",
          a.like_count AS "likeCount",
          a.popularity AS "popularity",
          COALESCE((
            SELECT COUNT(*)::INT
            FROM artist_likes al
            WHERE al.artist_id = a.id
          ), 0) AS "likesFromTable"
        FROM artists a
        WHERE a.id = $1
        LIMIT 1;
      `,
      [artistId]
    ),
    getPool().query<{
      id: number;
      title: string;
      thumbnailUrl: string | null;
      views: number;
      tone: string | null;
      hasLyrics: boolean;
      hasSheet: boolean;
      isFeatured: boolean;
      moderationState: string | null;
      reviewStatus: 'reviewed' | 'pending';
    }>(
      `
        SELECT
          s.id AS "id",
          s.title AS "title",
          NULLIF(COALESCE(s.images_json -> 0 ->> 'url', ''), '') AS "thumbnailUrl",
          COALESCE(s.total_views, 0)::INT AS "views",
          NULLIF(MAX(NULLIF(sv.tone, '')), '') AS "tone",
          COALESCE(BOOL_OR(
            COALESCE(i.name, '') ILIKE '%letra%'
            OR COALESCE(sv.notation_type, '') ILIKE '%lyric%'
            OR COALESCE(sv.notation_type, '') ILIKE '%letra%'
          ), FALSE) AS "hasLyrics",
          COALESCE(BOOL_OR(
            COALESCE(i.name, '') ILIKE '%partitura%'
            OR COALESCE(i.name, '') ILIKE '%sheet%'
            OR COALESCE(sv.notation_type, '') ILIKE '%partitura%'
            OR COALESCE(sv.notation_type, '') ILIKE '%sheet%'
            OR COALESCE(sv.notation_type, '') ILIKE '%chord%'
            OR COALESCE(sv.notation_type, '') ILIKE '%acorde%'
          ), FALSE) AS "hasSheet",
          NULLIF(UPPER(COALESCE(ss.code, '')), '') AS "moderationState",
          CASE
            WHEN UPPER(COALESCE(ss.code, '')) = 'APPROVED' THEN 'reviewed'
            ELSE 'pending'
          END AS "reviewStatus",
          EXISTS (
            SELECT 1
            FROM featured_songs fs
            WHERE fs.song_id = s.id
              AND fs.snapshot_week = (SELECT MAX(snapshot_week) FROM featured_songs)
          ) AS "isFeatured"
        FROM songs s
        LEFT JOIN song_versions sv ON sv.song_id = s.id
        LEFT JOIN instruments i ON i.id = sv.instrument_id
        LEFT JOIN song_states ss ON ss.id = s.state_id
        LEFT JOIN users u ON u.id = s.user_id
        WHERE (
            s.artist_id = $1
            OR sv.artist_id = $1
          )
          AND (
            ss.id IS NULL
            OR UPPER(COALESCE(ss.code, '')) IN ('PUBLISHED', 'APPROVED')
            OR (
              UPPER(COALESCE(ss.code, '')) = 'DRAFT'
              AND $2::TEXT IS NOT NULL
              AND u.firebase_uid = $2::TEXT
            )
          )
        GROUP BY s.id
        ORDER BY
          "isFeatured" DESC,
          COALESCE(s.popularity, 0) DESC,
          COALESCE(s.like_count, 0) DESC,
          COALESCE(s.total_views, 0) DESC,
          s.id DESC
        LIMIT 30;
      `,
      [artistId, viewerFirebaseUid ?? null]
    ),
    listArtistAlbumDiscographyRows(artistId),
    getPool().query<{
      id: number;
      name: string;
      imageUrl: string | null;
    }>(
      `
        SELECT
          suggested.id AS "id",
          suggested.name AS "name",
          suggested.image_url AS "imageUrl"
        FROM artist_suggestions rel
        INNER JOIN artists suggested ON suggested.id = rel.suggested_artist_id
        WHERE rel.artist_id = $1
        ORDER BY rel.relevance_score DESC, suggested.popularity DESC NULLS LAST, suggested.name ASC
        LIMIT 12;
      `,
      [artistId]
    ),
    getPool().query<{ songId: number }>(
      `
        SELECT
          fs.song_id AS "songId"
        FROM featured_songs fs
        INNER JOIN songs s ON s.id = fs.song_id
        WHERE s.artist_id = $1
          AND fs.snapshot_week = (SELECT MAX(snapshot_week) FROM featured_songs)
        ORDER BY fs.rank_position ASC
        LIMIT 6;
      `,
      [artistId]
    )
  ]);

  const artistMeta = artistMetaResult.rows[0];
  const songs: CloudSqlArtistSongProfileRow[] = songsResult.rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    views: Number.isFinite(row.views) ? row.views : 0,
    tone: row.tone ?? '',
    hasLyrics: Boolean(row.hasLyrics),
    hasSheet: Boolean(row.hasSheet),
    isVerified: Boolean(row.isFeatured),
    moderationState: row.moderationState ?? undefined,
    reviewStatus: row.reviewStatus
  }));

  const discography = mapAlbumDiscographyRows(discographyRows);

  const suggestedArtists: CloudSqlSuggestedArtistProfileRow[] = suggestionsResult.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    imageUrl: row.imageUrl ?? undefined
  }));

  if (suggestedArtists.length === 0) {
    const normalizedGenres = normalizeGenres(artistMeta?.genres)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    try {
      const fallbackSuggestionsResult = await getPool().query<{
        id: number;
        name: string;
        imageUrl: string | null;
      }>(
        `
          SELECT
            a.id AS "id",
            a.name AS "name",
            a.image_url AS "imageUrl"
          FROM artists a
          WHERE a.id <> $1
            AND (
              COALESCE(array_length($2::TEXT[], 1), 0) = 0
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                  CASE
                    WHEN jsonb_typeof(a.genres_json) = 'array' THEN a.genres_json
                    ELSE '[]'::jsonb
                  END
                ) AS g(value)
                WHERE LOWER(TRIM(g.value)) = ANY($2::TEXT[])
              )
            )
          ORDER BY
            CASE
              WHEN COALESCE(array_length($2::TEXT[], 1), 0) = 0 THEN 0
              ELSE (
                SELECT COUNT(*)::INT
                FROM jsonb_array_elements_text(
                  CASE
                    WHEN jsonb_typeof(a.genres_json) = 'array' THEN a.genres_json
                    ELSE '[]'::jsonb
                  END
                ) AS g2(value)
                WHERE LOWER(TRIM(g2.value)) = ANY($2::TEXT[])
              )
            END DESC,
            COALESCE(a.popularity, 0) DESC,
            a.name ASC
          LIMIT 12;
        `,
        [artistId, normalizedGenres]
      );

      fallbackSuggestionsResult.rows.forEach((row) => {
        suggestedArtists.push({
          id: String(row.id),
          name: row.name,
          imageUrl: row.imageUrl ?? undefined
        });
      });
    } catch {
      // Keep profile bundle available even if fallback suggestions fail.
    }
  }

  const highlightedFromFeatured = featuredResult.rows
    .map((row) => Number(row.songId))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => String(value));

  const highlightedSongIds = highlightedFromFeatured.length > 0
    ? highlightedFromFeatured
    : songs.slice(0, 6).map((song) => song.id);

  const images = normalizeImages(artistMeta?.images);
  const fallbackImageUrl = artistMeta?.imageUrl ?? artist.imageUrl ?? null;
  const resolvedImages = images.length > 0
    ? images
    : fallbackImageUrl
      ? [{ url: fallbackImageUrl }]
      : [];

  const genres = normalizeGenres(artistMeta?.genres);
  const songsTotalViews = songs.reduce((acc, song) => acc + song.views, 0);
  const likesFromTable = Number(artistMeta?.likesFromTable ?? 0);

  return {
    artist: {
      ...artist,
      bio: artistMeta?.bio ?? null,
      imageUrl: fallbackImageUrl,
      images: resolvedImages,
      genres,
      likeCount: Math.max(Number(artistMeta?.likeCount ?? 0), likesFromTable),
      totalViews: Math.max(Number(artistMeta?.totalViews ?? 0), songsTotalViews),
      popularity: Number(artistMeta?.popularity ?? 0)
    },
    songs,
    discography,
    suggestedArtists,
    highlightedSongIds
  };
}

export async function createArtist(name: string, type: string = 'unknown'): Promise<CloudSqlArtistRow> {
  const result = await getPool().query<CloudSqlArtistRow>(
    `
      INSERT INTO artists (name, type)
      VALUES ($1, $2)
      RETURNING id, name, type, image_url AS "imageUrl";
    `,
    [name.trim(), type]
  );

  if (!result.rows.length) {
    throw new Error('Cloud SQL artist insert returned no rows.');
  }

  return result.rows[0];
}

export async function getArtistLikeState(artistId: number, viewerFirebaseUid: string): Promise<CloudSqlArtistLikeState> {
  const uid = viewerFirebaseUid.trim();
  if (!uid) {
    return { isLiked: false, likeCount: 0 };
  }

  const userId = await resolveCloudSqlUserIdByFirebaseUid(uid);
  if (!userId) {
    return { isLiked: false, likeCount: 0 };
  }

  const result = await getPool().query<{
    isLiked: boolean;
    likeCount: number;
  }>(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM artist_likes al
          WHERE al.artist_id = $1
            AND al.user_id = $2
        ) AS "isLiked",
        COALESCE((
          SELECT COUNT(*)::INT
          FROM artist_likes al
          WHERE al.artist_id = $1
        ), 0) AS "likeCount";
    `,
    [artistId, userId]
  );

  return {
    isLiked: Boolean(result.rows[0]?.isLiked),
    likeCount: Number(result.rows[0]?.likeCount ?? 0)
  };
}

export async function setArtistLike(artistId: number, viewerFirebaseUid: string): Promise<CloudSqlArtistLikeState> {
  const uid = viewerFirebaseUid.trim();
  if (!uid) {
    throw new Error('Authenticated viewer uid is required to like an artist.');
  }

  const userId = await resolveCloudSqlUserIdByFirebaseUid(uid);
  if (!userId) {
    throw new Error('Cloud SQL user mapping not found for authenticated viewer.');
  }

  await getPool().query(
    `
      INSERT INTO artist_likes (artist_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (artist_id, user_id) DO NOTHING;
    `,
    [artistId, userId]
  );

  const syncResult = await getPool().query<{ likeCount: number }>(
    `
      WITH computed AS (
        SELECT COUNT(*)::INT AS "likeCount"
        FROM artist_likes
        WHERE artist_id = $1
      ),
      updated AS (
        UPDATE artists a
        SET like_count = computed."likeCount"
        FROM computed
        WHERE a.id = $1
        RETURNING a.like_count AS "likeCount"
      )
      SELECT "likeCount" FROM updated;
    `,
    [artistId]
  );

  return {
    isLiked: true,
    likeCount: Number(syncResult.rows[0]?.likeCount ?? 0)
  };
}

export async function removeArtistLike(artistId: number, viewerFirebaseUid: string): Promise<CloudSqlArtistLikeState> {
  const uid = viewerFirebaseUid.trim();
  if (!uid) {
    throw new Error('Authenticated viewer uid is required to unlike an artist.');
  }

  const userId = await resolveCloudSqlUserIdByFirebaseUid(uid);
  if (!userId) {
    throw new Error('Cloud SQL user mapping not found for authenticated viewer.');
  }

  await getPool().query(
    `
      DELETE FROM artist_likes
      WHERE artist_id = $1
        AND user_id = $2;
    `,
    [artistId, userId]
  );

  const syncResult = await getPool().query<{ likeCount: number }>(
    `
      WITH computed AS (
        SELECT COUNT(*)::INT AS "likeCount"
        FROM artist_likes
        WHERE artist_id = $1
      ),
      updated AS (
        UPDATE artists a
        SET like_count = computed."likeCount"
        FROM computed
        WHERE a.id = $1
        RETURNING a.like_count AS "likeCount"
      )
      SELECT "likeCount" FROM updated;
    `,
    [artistId]
  );

  return {
    isLiked: false,
    likeCount: Number(syncResult.rows[0]?.likeCount ?? 0)
  };
}

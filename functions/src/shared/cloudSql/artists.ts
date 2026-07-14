import { type Pool } from 'pg';
import { getSharedPool, withPoolRetry } from './pool';

export interface CloudSqlArtistRow {
  id: number;
  name: string;
  type: string;
  bio?: string | null;
  imageUrl: string | null;
  images?: Array<{ url: string; width?: number; height?: number }>;
  genres?: string[];
  categories?: string[];
  songsCount?: number;
  likeCount?: number;
  totalViews?: number;
  popularity?: number;
  status?: string;
  isOfficial?: boolean;
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

function getPool(): Pool {
  return getSharedPool();
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
  return withPoolRetry(async () => {
    const result = await getPool().query<CloudSqlArtistRow>(
      `
        SELECT
          id,
          name,
          type,
          image_url AS "imageUrl"
        FROM artists
        WHERE popularity IS NOT NULL
          AND popularity > 0
        ORDER BY
          compute_artist_popularity(COALESCE(total_views, 0), COALESCE(like_count, 0)) DESC,
          popularity DESC NULLS LAST,
          name ASC
        LIMIT $1;
      `,
      [limit]
    );

    return result.rows;
  });
}

export async function listActiveCategorySlugs(limit: number = 200): Promise<string[]> {
  return withPoolRetry(async () => {
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;

    const activeResult = await getPool().query<{ slug: string }>(
      `
        SELECT slug
        FROM categories
        WHERE is_active = TRUE
          AND slug IS NOT NULL
          AND btrim(slug) <> ''
        ORDER BY slug ASC
        LIMIT $1;
      `,
      [normalizedLimit]
    );

    return activeResult.rows
      .map((row) => (typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : ''))
      .filter((slug) => slug.length > 0);
  });
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
    id: Number.isFinite(row.albumId) && Number(row.albumId) > 0 ? `album_${row.albumId}` : String(row.id ?? `discography-${index}`),
    title: row.title,
    year: Number.isFinite(row.year) ? Number(row.year) : new Date().getFullYear(),
    coverUrl: row.coverUrl ?? undefined,
    albumId: Number.isFinite(row.albumId) && Number(row.albumId) > 0 ? `album_${row.albumId}` : undefined,
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

export async function updateAlbumStatusInCloudSql(sqlAlbumId: number, status: string): Promise<void> {
  const albumId = Number(sqlAlbumId);
  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';

  if (!Number.isFinite(albumId) || albumId <= 0 || !normalizedStatus) {
    return;
  }

  await getPool().query(
    `
      UPDATE albums
      SET status = $2
      WHERE id = $1;
    `,
    [Math.floor(albumId), normalizedStatus]
  );
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
        WITH max_week AS (
          SELECT MAX(snapshot_week) AS week
          FROM featured_songs
        )
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
          COALESCE(fs.song_id IS NOT NULL, FALSE) AS "isFeatured"
        FROM songs s
        LEFT JOIN song_versions sv ON sv.song_id = s.id
        LEFT JOIN instruments i ON i.id = sv.instrument_id
        LEFT JOIN song_states ss ON ss.id = s.state_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN featured_songs fs ON fs.song_id = s.id AND fs.snapshot_week = (SELECT week FROM max_week)
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
        GROUP BY s.id, fs.song_id, ss.code
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
      // OPTIMIZATION: Use GIN index with @> operator for genre matching instead of jsonb_array_elements_text
      const genresJsonArray = JSON.stringify(normalizedGenres);
      
      const fallbackSuggestionsResult = await getPool().query<{
        id: number;
        name: string;
        imageUrl: string | null;
        genreMatchCount: number;
      }>(
        `
          SELECT
            a.id AS "id",
            a.name AS "name",
            a.image_url AS "imageUrl",
            CASE
              WHEN COALESCE(array_length($2::TEXT[], 1), 0) = 0 THEN 0
              ELSE (
                SELECT COUNT(*)::INT
                FROM jsonb_array_elements_text(
                  CASE
                    WHEN jsonb_typeof(a.genres_json) = 'array' THEN a.genres_json
                    ELSE '[]'::jsonb
                  END
                ) AS g(value)
                WHERE LOWER(TRIM(g.value)) = ANY($2::TEXT[])
              )
            END AS "genreMatchCount"
          FROM artists a
          WHERE a.id <> $1
            AND (
              COALESCE(array_length($2::TEXT[], 1), 0) = 0
              OR a.genres_json @> $3::jsonb
            )
          ORDER BY
            "genreMatchCount" DESC,
            COALESCE(a.popularity, 0) DESC,
            a.name ASC
          LIMIT 12;
        `,
        [artistId, normalizedGenres, genresJsonArray]
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

export interface FeaturedArtistSnapshotRow {
  snapshotWeek: string;
  rankPosition: number;
  artistId: number;
  name: string;
  imageUrl: string | null;
  score: number;
  popularity: number;
  totalViews: number;
  likeCount: number;
}

export async function refreshFeaturedArtistsSnapshot(limit: number = 50, snapshotWeek?: string): Promise<FeaturedArtistSnapshotRow[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const normalizedWeek = typeof snapshotWeek === 'string' && snapshotWeek.trim().length > 0
    ? snapshotWeek.trim()
    : null;

  const currentWeek = normalizedWeek ?? new Date().toISOString().slice(0, 10);

  const result = await getPool().query<{
    id: number;
    name: string;
    imageUrl: string | null;
    likeCount: number;
    totalViews: number;
    popularity: number;
    score: number;
  }>(
    `
      SELECT
        id,
        name,
        image_url AS "imageUrl",
        COALESCE(like_count, 0)::INT AS "likeCount",
        COALESCE(total_views, 0)::INT AS "totalViews",
        COALESCE(popularity, 0)::INT AS "popularity",
        compute_artist_popularity(COALESCE(total_views, 0), COALESCE(like_count, 0)) AS "score"
      FROM artists
      WHERE popularity IS NOT NULL
        AND popularity > 0
      ORDER BY score DESC, popularity DESC, like_count DESC, total_views DESC, name ASC
      LIMIT $1;
    `,
    [safeLimit]
  );

  return result.rows.map((row, index) => ({
    snapshotWeek: currentWeek,
    rankPosition: index + 1,
    artistId: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    score: row.score,
    popularity: row.popularity,
    totalViews: row.totalViews,
    likeCount: row.likeCount
  }));
}

export async function syncFeaturedArtistsToSuggestions(artists: FeaturedArtistSnapshotRow[]): Promise<void> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // Delete previous global suggestions
    await client.query(
      `
        DELETE FROM artist_suggestions
        WHERE artist_id IS NULL;
      `
    );

    // Insert new global suggestions
    for (const artist of artists) {
      await client.query(
        `
          INSERT INTO artist_suggestions (artist_id, suggested_artist_id, relevance_score)
          VALUES (NULL, $1, $2)
          ON CONFLICT (artist_id, suggested_artist_id) DO UPDATE SET
            relevance_score = $2;
        `,
        [artist.artistId, artist.score]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateArtistInCloudSql(
  artistId: number,
  data: {
    name?: string;
    type?: string;
    bio?: string | null;
    imageUrl?: string | null;
    images?: Array<{ url: string; width?: number; height?: number }>;
    genres?: string[];
    categories?: string[];
    status?: string;
    isOfficial?: boolean;
  }
): Promise<CloudSqlArtistRow> {
  const numericArtistId = Number(artistId);
  if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
    throw new Error('Invalid artist ID');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(data.name.trim());
    paramIndex++;
  }

  if (data.type !== undefined) {
    updates.push(`type = $${paramIndex}`);
    values.push(data.type);
    paramIndex++;
  }

  if (data.bio !== undefined) {
    updates.push(`bio = $${paramIndex}`);
    values.push(data.bio);
    paramIndex++;
  }

  if (data.imageUrl !== undefined) {
    updates.push(`image_url = $${paramIndex}`);
    values.push(data.imageUrl);
    paramIndex++;
  }

  if (data.images !== undefined) {
    updates.push(`images_json = $${paramIndex}`);
    values.push(JSON.stringify(data.images));
    paramIndex++;
  }

  if (data.genres !== undefined) {
    updates.push(`genres_json = $${paramIndex}`);
    values.push(JSON.stringify(data.genres));
    paramIndex++;
  }

  if (data.categories !== undefined) {
    updates.push(`categories_json = $${paramIndex}`);
    values.push(JSON.stringify(data.categories));
    paramIndex++;
  }

  if (data.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    values.push(data.status);
    paramIndex++;
  }

  if (data.isOfficial !== undefined) {
    updates.push(`is_official = $${paramIndex}`);
    values.push(data.isOfficial);
    paramIndex++;
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(numericArtistId);

  const query = `
    UPDATE artists
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING
      id,
      name,
      type,
      bio,
      image_url AS "imageUrl",
      images_json AS "images",
      genres_json AS "genres",
      categories_json AS "categories",
      status,
      created_at AS "createdAt";
  `;

  const result = await getPool().query<CloudSqlArtistRow>(query, values);

  if (!result.rows.length) {
    throw new Error('Artist not found');
  }

  return result.rows[0];
}

export async function softDeleteArtist(artistId: number): Promise<CloudSqlArtistRow> {
  const numericArtistId = Number(artistId);
  if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
    throw new Error('Invalid artist ID');
  }

  const query = `
    UPDATE artists
    SET status = 'inactive'
    WHERE id = $1
    RETURNING
      id,
      name,
      type,
      bio,
      image_url AS "imageUrl",
      images_json AS "images",
      genres_json AS "genres",
      categories_json AS "categories",
      status,
      created_at AS "createdAt";
  `;

  const result = await getPool().query<CloudSqlArtistRow>(query, [numericArtistId]);

  if (!result.rows.length) {
    throw new Error('Artist not found');
  }

  return result.rows[0];
}

export async function hardDeleteArtist(artistId: number): Promise<void> {
  const numericArtistId = Number(artistId);
  if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
    throw new Error('Invalid artist ID');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // Delete artist suggestions
    await client.query(
      'DELETE FROM artist_suggestions WHERE artist_id = $1 OR suggested_artist_id = $1',
      [numericArtistId]
    );

    // Delete artist likes
    await client.query('DELETE FROM artist_likes WHERE artist_id = $1', [numericArtistId]);

    // Update songs to remove artist reference
    await client.query('UPDATE songs SET artist_id = NULL WHERE artist_id = $1', [numericArtistId]);

    // Update song versions to remove artist reference
    await client.query('UPDATE song_versions SET artist_id = NULL WHERE artist_id = $1', [numericArtistId]);

    // Update albums to remove artist reference
    await client.query('UPDATE albums SET artist_id = NULL WHERE artist_id = $1', [numericArtistId]);

    // Delete artist discography
    await client.query('DELETE FROM artist_discography WHERE artist_id = $1', [numericArtistId]);

    // Delete artist
    await client.query('DELETE FROM artists WHERE id = $1', [numericArtistId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getArtistByIdForAdmin(artistId: number): Promise<CloudSqlArtistRow | null> {
  const numericArtistId = Number(artistId);
  if (!Number.isFinite(numericArtistId) || numericArtistId <= 0) {
    console.log('getArtistByIdForAdmin: Invalid artist ID', artistId);
    return null;
  }

  const query = `
    SELECT
      id,
      name,
      type,
      bio,
      image_url AS "imageUrl",
      images_json AS "images",
      genres_json AS "genres",
      categories_json AS "categories",
      like_count AS "likeCount",
      total_views AS "totalViews",
      popularity,
      COALESCE(status, 'active') AS "status",
      COALESCE(is_official, FALSE) AS "isOfficial",
      created_at AS "createdAt"
    FROM artists
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await getPool().query<CloudSqlArtistRow>(query, [numericArtistId]);
  console.log('getArtistByIdForAdmin: Query result for artist', numericArtistId, ':', result.rows[0]);
  return result.rows[0] ?? null;
}

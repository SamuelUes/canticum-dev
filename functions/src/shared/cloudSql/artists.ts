import { Pool, type PoolConfig } from 'pg';

export interface CloudSqlArtistRow {
  id: number;
  name: string;
  type: string;
  imageUrl: string | null;
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
    `SELECT id, name, type, image_url AS "imageUrl" FROM artists WHERE id = $1 LIMIT 1;`,
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
  const result = await getPool().query<CloudSqlArtistRow>(
    `
      SELECT id, name, type, image_url AS "imageUrl"
      FROM artists
      WHERE LOWER(name) = LOWER($1)
         OR LOWER(name) = LOWER($2)
         OR LOWER(name) ILIKE LOWER($3)
      ORDER BY popularity DESC NULLS LAST, name ASC
      LIMIT 1;
    `,
    [trimmed, normalized, `%${normalized}%`]
  );

  return result.rows[0] ?? null;
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

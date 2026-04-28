import type { UserRecord } from 'firebase-admin/auth';
import { randomBytes, scryptSync } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';

interface CloudSqlUserRow {
  id: number;
  firebaseUid: string;
  name: string;
  email: string;
  createdAt: Date;
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

function hashPassword(plaintext: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plaintext, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function resolveDisplayName(authUser: UserRecord, displayNameOverride?: string): string {
  const explicit = typeof displayNameOverride === 'string' ? displayNameOverride.trim() : '';
  if (explicit) {
    return explicit;
  }

  const fromAuth = typeof authUser.displayName === 'string' ? authUser.displayName.trim() : '';
  if (fromAuth) {
    return fromAuth;
  }

  if (authUser.email) {
    return authUser.email.split('@')[0];
  }

  return `user-${authUser.uid.slice(0, 8)}`;
}

function resolveEmail(authUser: UserRecord): string {
  if (authUser.email) {
    return authUser.email;
  }

  return `${authUser.uid}@firebase.local`;
}

export async function upsertUserInCloudSql(authUser: UserRecord, displayNameOverride?: string, rawPassword?: string): Promise<CloudSqlUserRow> {
  const name = resolveDisplayName(authUser, displayNameOverride);
  const email = resolveEmail(authUser);
  const passwordHash = rawPassword ? hashPassword(rawPassword) : null;

  const query = `
    INSERT INTO users (firebase_uid, name, email, password, auth_provider)
    VALUES ($1, $2, $3, $4, 'firebase_auth')
    ON CONFLICT (email)
    DO UPDATE SET
      firebase_uid = EXCLUDED.firebase_uid,
      name = EXCLUDED.name,
      auth_provider = EXCLUDED.auth_provider,
      password = COALESCE(EXCLUDED.password, users.password)
    RETURNING id, firebase_uid AS "firebaseUid", name, email, created_at AS "createdAt";
  `;

  try {
    const result = await getPool().query<CloudSqlUserRow>(query, [authUser.uid, name, email, passwordHash]);

    if (!result.rows.length) {
      throw new Error('Cloud SQL upsert returned no rows.');
    }

    return result.rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pgCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (pgCode === '28P01' || message.includes('password authentication failed')) {
      throw new Error('Cloud SQL authentication failed. Verify CLOUD_SQL_USER and CLOUD_SQL_PASSWORD.');
    }

    if (message.includes('column "firebase_uid" does not exist') || message.includes('column "auth_provider" does not exist')) {
      throw new Error('Cloud SQL repertoire mismatch in users table. Apply database/bdsql.sql updates for firebase_uid and auth_provider columns.');
    }

    throw error;
  }
}

export async function hasCloudSqlUser(uid: string, email?: string | null): Promise<boolean> {
  const query = `
    SELECT 1
    FROM users
    WHERE firebase_uid = $1
      OR ($2::text IS NOT NULL AND email = $2)
    LIMIT 1;
  `;

  const result = await getPool().query(query, [uid, email ?? null]);
  return result.rows.length > 0;
}

export async function testCloudSqlConnection(): Promise<void> {
  await getPool().query('SELECT 1;');
}

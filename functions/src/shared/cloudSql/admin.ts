import { type Pool } from 'pg';
import { getSharedPool, withPoolRetry } from './pool';

export interface CloudSqlAdminUserRow {
  id: number;
  firebaseUid: string;
  name: string;
  email: string;
  status: 'active' | 'away' | string;
  createdAt: Date;
}

function getPool(): Pool {
  return getSharedPool();
}

function normalizeStatus(status: unknown): 'active' | 'away' {
  return typeof status === 'string' && status.trim().toLowerCase() === 'away' ? 'away' : 'active';
}

export async function listCloudSqlAdminUsers(limit = 12): Promise<CloudSqlAdminUserRow[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 12;

  const query = `
    SELECT
      id,
      firebase_uid AS "firebaseUid",
      name,
      email,
      status,
      created_at AS "createdAt"
    FROM users
    ORDER BY created_at DESC
    LIMIT $1;
  `;

  const result = await withPoolRetry(() => getPool().query<CloudSqlAdminUserRow>(query, [safeLimit]));
  return result.rows;
}

export async function getCloudSqlAdminUser(firebaseUid: string): Promise<CloudSqlAdminUserRow | null> {
  const query = `
    SELECT
      id,
      firebase_uid AS "firebaseUid",
      name,
      email,
      status,
      created_at AS "createdAt"
    FROM users
    WHERE firebase_uid = $1
    LIMIT 1;
  `;

  const result = await withPoolRetry(() => getPool().query<CloudSqlAdminUserRow>(query, [firebaseUid]));
  return result.rows[0] ?? null;
}

export async function updateCloudSqlAdminUserStatus(firebaseUid: string, status: 'active' | 'away'): Promise<CloudSqlAdminUserRow> {
  const query = `
    UPDATE users
    SET status = $1
    WHERE firebase_uid = $2
    RETURNING
      id,
      firebase_uid AS "firebaseUid",
      name,
      email,
      status,
      created_at AS "createdAt";
  `;

  const result = await withPoolRetry(() => getPool().query<CloudSqlAdminUserRow>(query, [normalizeStatus(status), firebaseUid]));

  if (!result.rows.length) {
    throw new Error('User not found in Cloud SQL.');
  }

  return result.rows[0];
}

export async function softDeleteCloudSqlAdminUser(firebaseUid: string): Promise<CloudSqlAdminUserRow> {
  return updateCloudSqlAdminUserStatus(firebaseUid, 'away');
}

export interface CloudSqlDraftSongRow {
  id: number;
  title: string;
  artistName: string | null;
  createdAt: Date;
  stateCode: string;
  firestoreId: string | null;
}

export interface AdminDashboardMetrics {
  totalSongs: number;
  pendingSongs: number;
  totalArtists: number;
  totalRepertoires: number;
  newUsersLast48h: number;
}

async function safeCount(query: string, params?: unknown[]): Promise<number> {
  try {
    const result = await withPoolRetry(() => getPool().query<{ count: string }>(query, params));
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    console.error('[AdminDashboardMetrics] Query failed:', query, error);
    return 0;
  }
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const totalSongs = await safeCount('SELECT COUNT(*)::text AS count FROM songs');
  const pendingSongs = await safeCount(`
    SELECT COUNT(*)::text AS count
    FROM songs s
    JOIN song_states ss ON ss.id = s.state_id
    WHERE UPPER(ss.code) IN ('DRAFT', 'UPLOADED', 'IN_REVIEW')
  `);
  const totalArtists = await safeCount('SELECT COUNT(*)::text AS count FROM artists');
  const totalRepertoires = await safeCount('SELECT COUNT(*)::text AS count FROM repertoires');
  const newUsersLast48h = await safeCount(`
    SELECT COUNT(*)::text AS count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '48 hours'
  `);

  return {
    totalSongs,
    pendingSongs,
    totalArtists,
    totalRepertoires,
    newUsersLast48h
  };
}

export async function getDraftSongsForAdmin(limit = 10, offset = 0): Promise<CloudSqlDraftSongRow[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 10;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;

  const query = `
    SELECT
      s.id,
      s.title,
      a.name AS "artistName",
      s.created_at AS "createdAt",
      ss.code AS "stateCode"
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    JOIN song_states ss ON ss.id = s.state_id
    WHERE UPPER(ss.code) IN ('DRAFT', 'UPLOADED', 'IN_REVIEW')
    ORDER BY s.created_at DESC
    LIMIT $1 OFFSET $2;
  `;

  const result = await withPoolRetry(() => getPool().query<Omit<CloudSqlDraftSongRow, 'firestoreId'>>(query, [safeLimit, safeOffset]));
  const rows = result.rows;

  // Fetch Firestore IDs for each song
  const { getAppFirestore } = require('../firestore');
  const db = getAppFirestore();

  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      let firestoreId: string | null = null;
      try {
        const snap = await db.collection('songs').where('sqlSongId', '==', row.id).limit(1).get();
        if (!snap.empty) {
          firestoreId = snap.docs[0].id;
        }
      } catch (error) {
        console.error(`Failed to fetch Firestore ID for song ${row.id}:`, error);
      }
      return {
        ...row,
        firestoreId
      } as CloudSqlDraftSongRow;
    })
  );

  return enrichedRows;
}

export async function getDraftSongsCount(): Promise<number> {
  const query = `
    SELECT COUNT(*)::text AS count
    FROM songs s
    JOIN song_states ss ON ss.id = s.state_id
    WHERE UPPER(ss.code) IN ('DRAFT', 'UPLOADED', 'IN_REVIEW');
  `;

  const result = await withPoolRetry(() => getPool().query<{ count: string }>(query));
  return Number(result.rows[0]?.count ?? 0);
}

export interface CloudSqlArtistRow {
  id: number;
  name: string;
  createdAt: Date;
  songCount: number;
}

export async function getArtistsForAdmin(limit = 10, offset = 0): Promise<CloudSqlArtistRow[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 10;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;

  const query = `
    SELECT
      a.id,
      a.name,
      a.created_at AS "createdAt",
      COUNT(s.id) AS "songCount"
    FROM artists a
    LEFT JOIN songs s ON s.artist_id = a.id
    GROUP BY a.id, a.name, a.created_at
    ORDER BY a.created_at DESC
    LIMIT $1 OFFSET $2;
  `;

  const result = await withPoolRetry(() => getPool().query<CloudSqlArtistRow>(query, [safeLimit, safeOffset]));
  return result.rows;
}

export async function getArtistsCount(): Promise<number> {
  const query = `SELECT COUNT(*)::text AS count FROM artists;`;
  const result = await withPoolRetry(() => getPool().query<{ count: string }>(query));
  return Number(result.rows[0]?.count ?? 0);
}

import * as functions from 'firebase-functions/v1';
import '../../shared/firebaseAdmin';
import { getAppFirestore } from '../../shared/firestore';
import {
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  sendError,
  sendJson
} from '../../shared/http/http';
import { countSongsByStatusForUser, type UserSongStatusCountRow } from '../../shared/cloudSql/songs';
import { updateUserStatus } from '../../shared/cloudSql/users';

const STATUS_ORDER = ['DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'] as const;
type CanonicalStatus = (typeof STATUS_ORDER)[number];

type AccountSongSummary = {
  id: string;
  sqlSongId?: number | null;
  title: string;
  subtitle?: string;
  status: CanonicalStatus;
  coverImageUrl?: string;
  updatedAt?: string | null;
};

type AccountrepertoireSummary = {
  id: string;
  title: string;
  subtitle?: string;
  status: CanonicalStatus;
  isPublic: boolean;
  coverImageUrl?: string;
  updatedAt?: string | null;
};

type AccountProfileSummary = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  plan: string;
  premium: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function normalizeStatus(raw: unknown): CanonicalStatus {
  const value = String(raw ?? '').trim().toUpperCase();
  if (STATUS_ORDER.includes(value as CanonicalStatus)) {
    return value as CanonicalStatus;
  }
  return 'DRAFT';
}

function resolveSongStatus(data: Record<string, unknown>): CanonicalStatus {
  if (typeof data.status === 'string' && data.status.trim()) {
    return normalizeStatus(data.status);
  }
  if (data.isPublic) {
    return 'PUBLISHED';
  }
  return 'DRAFT';
}

function resolveRepertoireStatus(data: Record<string, unknown>): CanonicalStatus {
  if (typeof data.status === 'string' && data.status.trim()) {
    return normalizeStatus(data.status);
  }
  if (data.isPublic || data.visibility === 'public') {
    return 'PUBLISHED';
  }
  return 'DRAFT';
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toISOString();
    } catch {
      return null;
    }
  }

  if (typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    try {
      const ms = (value as { toMillis: () => number }).toMillis();
      if (Number.isFinite(ms)) {
        return new Date(ms).toISOString();
      }
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeSongDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): AccountSongSummary {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const status = resolveSongStatus(data);

  return {
    id: doc.id,
    sqlSongId: Number.isFinite(Number(data.sqlSongId)) ? Number(data.sqlSongId) : null,
    title: String(data.title ?? 'Canción sin título'),
    subtitle: typeof data.artistName === 'string' ? data.artistName : typeof data.author === 'string' ? data.author : undefined,
    status,
    coverImageUrl: typeof data.coverImageUrl === 'string' ? data.coverImageUrl : typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined,
    updatedAt: toIsoString(data.updatedAt ?? data.createdAt)
  };
}

function normalizeRepertoireDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): AccountrepertoireSummary {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const status = resolveRepertoireStatus(data);
  const isPublic = Boolean(data.isPublic ?? data.visibility === 'public');

  return {
    id: doc.id,
    title: String(data.title ?? 'Repertorio sin título'),
    subtitle: typeof data.description === 'string' ? data.description : undefined,
    status,
    isPublic,
    coverImageUrl: typeof data.coverImageUrl === 'string' ? data.coverImageUrl : undefined,
    updatedAt: toIsoString(data.updatedAt ?? data.createdAt)
  };
}

function mapStatusCounts(source: Iterable<{ status: CanonicalStatus }>): Record<CanonicalStatus, number> {
  const counts: Record<CanonicalStatus, number> = {
    DRAFT: 0,
    UPLOADED: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    PUBLISHED: 0,
    ARCHIVED: 0
  };

  for (const item of source) {
    counts[item.status] += 1;
  }

  return counts;
}

function normalizeCloudSqlCounts(rows: UserSongStatusCountRow[]): Record<CanonicalStatus, number> {
  const counts: Record<CanonicalStatus, number> = {
    DRAFT: 0,
    UPLOADED: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    PUBLISHED: 0,
    ARCHIVED: 0
  };

  rows.forEach((row) => {
    const status = normalizeStatus(row.status);
    counts[status] = (counts[status] ?? 0) + (Number.isFinite(row.total) ? Number(row.total) : 0);
  });

  return counts;
}

export const account = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  if (segments.length > 0) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  if (req.method === 'DELETE') {
    const auth = await getOptionalAuthContext(req);
    if (!auth?.uid) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required.');
      return;
    }

    const db = getAppFirestore();

    try {
      await db.collection('users').doc(auth.uid).update({
        status: 'away',
        updatedAt: new Date().toISOString()
      });

      await updateUserStatus(auth.uid, 'away');

      sendJson(res, 200, {
        ok: true,
        message: 'Cuenta marcada como away (soft-delete).'
      });
      return;
    } catch (error) {
      functions.logger.error('Account soft-delete failed', {
        uid: auth.uid,
        error: error instanceof Error ? error.message : String(error)
      });
      sendError(res, 500, 'internal', 'No se pudo marcar la cuenta como away.');
      return;
    }
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const auth = await getOptionalAuthContext(req);
  if (!auth?.uid) {
    sendError(res, 401, 'unauthorized', 'Authenticated user required.');
    return;
  }

  const requestUserId = typeof req.query.userId === 'string' && req.query.userId.trim().length > 0
    ? req.query.userId.trim()
    : auth.uid;
  const isSelfRequest = requestUserId === auth.uid;
  const isAdmin = auth.token.role === 'admin';

  if (!isSelfRequest && !isAdmin) {
    sendError(res, 403, 'forbidden', 'Solo puedes consultar tu propia cuenta.');
    return;
  }

  const db = getAppFirestore();

  try {
    const [profileSnap, songsSnap, repertoiresSnap, sqlStatusRows] = await Promise.all([
      db.collection('users').doc(requestUserId).get(),
      db.collection('songs').where('ownerUserId', '==', requestUserId).limit(200).get(),
      db.collection('repertoires').where('userId', '==', requestUserId).limit(200).get(),
      countSongsByStatusForUser(requestUserId).catch((error) => {
        functions.logger.error('Account summary cloud SQL aggregation failed', { error: error instanceof Error ? error.message : String(error) });
        return [] as UserSongStatusCountRow[];
      })
    ]);

    const profileData = (profileSnap.data() ?? {}) as Record<string, unknown>;
    const profile: AccountProfileSummary = {
      uid: requestUserId,
      email: typeof profileData.email === 'string' ? profileData.email : (auth.token.email ?? null),
      displayName: typeof profileData.displayName === 'string' ? profileData.displayName : (auth.token.name ?? null),
      role: typeof profileData.role === 'string' ? profileData.role : (typeof auth.token.role === 'string' ? auth.token.role : 'user'),
      plan: typeof profileData.plan === 'string' ? profileData.plan : (profileData.premium ? 'premium' : 'free'),
      premium: Boolean(profileData.premium ?? auth.token.premium ?? false),
      createdAt: toIsoString(profileData.createdAt),
      updatedAt: toIsoString(profileData.updatedAt)
    };

    const songs = songsSnap.docs.map(normalizeSongDoc).sort((a, b) => {
      const aDate = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bDate = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bDate - aDate;
    });

    const repertoires = repertoiresSnap.docs.map(normalizeRepertoireDoc).sort((a, b) => {
      const aDate = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bDate = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bDate - aDate;
    });

    const firestoreSongCounts = mapStatusCounts(songs);
    const firestoreRepertoireCounts = mapStatusCounts(repertoires);
    const cloudSqlSongCounts = normalizeCloudSqlCounts(sqlStatusRows);

    sendJson(res, 200, {
      ok: true,
      userId: requestUserId,
      profile,
      stats: {
        songs: {
          firestore: firestoreSongCounts,
          cloudSql: cloudSqlSongCounts
        },
        repertoires: firestoreRepertoireCounts
      },
      firestore: {
        songs,
        repertoires
      },
      cloudSql: {
        songs: sqlStatusRows,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    functions.logger.error('Account summary failed', {
      uid: requestUserId,
      error: error instanceof Error ? error.message : String(error)
    });
    sendError(res, 500, 'internal', 'No se pudo cargar la cuenta.');
  }
});

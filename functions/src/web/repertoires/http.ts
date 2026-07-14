import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import {
  getClientIp,
  getBodyRecord,
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  resolveRequestUserId,
  sendError,
  sendJson
} from '../../shared/http/http';
import {
  FREE_MAX_repertoireS,
  FREE_MAX_SONGS_PER_repertoire,
  countUserrepertoires,
  resolveIsPremium
} from '../../shared/plan/planLimits';
import { createRepertoireInCloudSql, searchSongsForRepertoire } from '../../shared/cloudSql/songs';
import { applyRateLimitHeaders, checkRateLimit } from '../../shared/rateLimit';
import { capitalizeFirstLetter } from '../../shared/validation';

function isMissingIndexError(error: unknown): boolean {
  const errorWithCode = error as { code?: unknown; message?: unknown };
  const code = typeof errorWithCode.code === 'string' || typeof errorWithCode.code === 'number'
    ? String(errorWithCode.code).toLowerCase()
    : '';
  const message = typeof errorWithCode.message === 'string' ? errorWithCode.message.toLowerCase() : '';

  return code === 'failed-precondition' || code === '9' || message.includes('failed_precondition');
}

function asMillis(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (typeof value === 'object') {
    const maybeToMillis = value as { toMillis?: unknown; _seconds?: unknown; seconds?: unknown };

    if (typeof maybeToMillis.toMillis === 'function') {
      try {
        return Number(maybeToMillis.toMillis());
      } catch {
        return 0;
      }
    }

    const seconds = Number(maybeToMillis._seconds ?? maybeToMillis.seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
  }

  return 0;
}

function normalizeRepertoireStatus(rawStatus: unknown, isPublic: boolean): string {
  const normalized = typeof rawStatus === 'string'
    ? rawStatus
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    : '';

  if (normalized === 'BORRADOR' || normalized === 'DRAFT') return 'DRAFT';
  if (normalized === 'IN_REVIEW' || normalized === 'EN REVISION' || normalized === 'REVIEW' || normalized === 'REVISION') return 'IN_REVIEW';
  if (normalized === 'REJECTED' || normalized === 'RECHAZADO') return 'REJECTED';
  if (normalized === 'APPROVED' || normalized === 'APROBADO') return 'APPROVED';
  if (normalized === 'PUBLISHED' || normalized === 'PUBLICADO') return 'PUBLISHED';
  return isPublic ? 'PUBLISHED' : 'DRAFT';
}

async function resolveUserDisplayName(userId: string, fallback: string): Promise<string> {
  if (!userId) {
    return fallback;
  }

  try {
    const snap = await getAppFirestore().collection('users').doc(userId).get();
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
    if (displayName) {
      return displayName;
    }

    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (email) {
      return email;
    }
  } catch {
  }

  return fallback;
}

async function normalizerepertoireResponse(repertoireId: string, raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const songIds = Array.isArray(raw.songIds) ? raw.songIds.map((value) => String(value)) : [];
  const selectedSongs = Array.isArray(raw.songs)
    ? raw.songs
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map((value) => {
        const songId = String(value.songId ?? '').trim();
        const versionId = typeof value.versionId === 'string' ? value.versionId.trim() : '';

        return {
          songId,
          ...(versionId ? { versionId } : {})
        };
      })
      .filter((value) => value.songId.length > 0)
    : [];
  const isPublic = Boolean(raw.isPublic ?? raw.visibility === 'public');
  const creatorUserId = String(raw.createdBy ?? raw.userId ?? raw.ownerUserId ?? '').trim();
  const createdBy = await resolveUserDisplayName(creatorUserId, creatorUserId);

  return {
    id: repertoireId,
    title: String(raw.title ?? ''),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy,
    ownerUserId: String(raw.ownerUserId ?? raw.userId ?? ''),
    userId: String(raw.userId ?? raw.ownerUserId ?? ''),
    isPublic,
    visibility: isPublic ? 'public' : 'private',
    status: normalizeRepertoireStatus(raw.status, isPublic),
    liturgicalType: String(raw.liturgicalType ?? raw.type ?? 'General'),
    songsCount: Number(raw.songsCount ?? songIds.length),
    sheetsCount: Number(raw.sheetsCount ?? 0),
    songIds,
    selectedSongs,
    description: String(raw.description ?? ''),
    coverImageUrl: typeof raw.coverImageUrl === 'string' ? raw.coverImageUrl : undefined
  };
}

function canReadrepertoire(repertoire: Record<string, unknown>, requestUserId: string | null, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  if (requestUserId && String(repertoire.userId ?? repertoire.ownerUserId ?? '') === requestUserId) {
    return true;
  }

  return Boolean(repertoire.isPublic ?? repertoire.visibility === 'public');
}

function canMutaterepertoire(repertoire: Record<string, unknown>, requestUserId: string | null, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  if (!requestUserId) {
    return false;
  }

  return String(repertoire.userId ?? repertoire.ownerUserId ?? '') === requestUserId;
}

const repertoiresHandler = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  const auth = await getOptionalAuthContext(req);
  const requestUserId = resolveRequestUserId(req, auth);
  const isAdmin = auth?.token.role === 'admin';

  // ── GET /repertoires  →  list repertoires by userId or public ──
  if (segments.length === 0 && req.method === 'GET') {
    const db = getAppFirestore();
    const isPublicFilter = typeof req.query.public === 'string' && req.query.public === 'true';

    let repertoiresSnap: FirebaseFirestore.QuerySnapshot;

    try {
      if (isPublicFilter) {
        try {
          repertoiresSnap = await db
            .collection('repertoires')
            .where('isPublic', '==', true)
            .orderBy('updatedAt', 'desc')
            .limit(100)
            .get();
        } catch (error) {
          if (!isMissingIndexError(error)) {
            throw error;
          }

          repertoiresSnap = await db
            .collection('repertoires')
            .where('isPublic', '==', true)
            .limit(100)
            .get();
        }
      } else if ((auth?.token.role as string | undefined) === 'admin') {
        try {
          repertoiresSnap = await db
            .collection('repertoires')
            .orderBy('updatedAt', 'desc')
            .limit(100)
            .get();
        } catch {
          repertoiresSnap = await db
            .collection('repertoires')
            .limit(100)
            .get();
        }
      } else if (requestUserId) {
        try {
          repertoiresSnap = await db
            .collection('repertoires')
            .where('userId', '==', requestUserId)
            .orderBy('updatedAt', 'desc')
            .limit(100)
            .get();
        } catch (error) {
          if (!isMissingIndexError(error)) {
            throw error;
          }

          repertoiresSnap = await db
            .collection('repertoires')
            .where('userId', '==', requestUserId)
            .limit(100)
            .get();
        }
      } else {
        sendError(res, 400, 'invalid_argument', 'userId query param or public=true is required.');
        return;
      }

      const repertoires = (await Promise.all(
        repertoiresSnap.docs.map((doc) => normalizerepertoireResponse(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      )).sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aTs = asMillis(a.updatedAt ?? a.createdAt);
        const bTs = asMillis(b.updatedAt ?? b.createdAt);
        return bTs - aTs;
      });

      sendJson(res, 200, { repertoires });
      return;
    } catch (error) {
      console.error('GET /repertoires failed:', error);
      sendError(res, 500, 'internal_error', 'Failed to list repertoires.');
      return;
    }
  }

  if (segments.length === 0 && req.method === 'POST') {
    if (!requestUserId) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required to create a repertoire.');
      return;
    }

    const createLimiterIdentifier = requestUserId || getClientIp(req) || 'anonymous';
    const createLimiter = await checkRateLimit(createLimiterIdentifier, 'repertoires_create', 20, 3600);
    applyRateLimitHeaders(res, 20, createLimiter);
    if (!createLimiter.allowed) {
      res.set('Retry-After', String(createLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Too many repertoire creation attempts. Retry in ${createLimiter.retryAfterSeconds}s.`);
      return;
    }

    const body = getBodyRecord(req);
    const title = typeof body.title === 'string' && body.title.trim() ? capitalizeFirstLetter(body.title.trim()) : 'Sin título';
    const songIds = Array.isArray(body.songIds) ? body.songIds.map((v) => String(v)) : [];
    const songs = Array.isArray(body.songs)
      ? body.songs
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map((value) => {
          const songId = String(value.songId ?? '').trim();
          const versionId = typeof value.versionId === 'string' ? value.versionId.trim() : '';

          return {
            songId,
            ...(versionId ? { versionId } : {})
          };
        })
        .filter((value) => value.songId.length > 0)
      : [];
    const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : false;
    const liturgicalType = typeof body.liturgicalType === 'string' ? body.liturgicalType.trim() : 'General';

    const premium = await resolveIsPremium(requestUserId, auth?.token ?? null);

    if (!premium) {
      const repertoireCount = await countUserrepertoires(requestUserId);
      if (repertoireCount >= FREE_MAX_repertoireS) {
        sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_repertoireS} repertorios. Actualiza a Premium para crear más.`);
        return;
      }
      if (songIds.length > FREE_MAX_SONGS_PER_repertoire) {
        sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_SONGS_PER_repertoire} canciones por repertorio. Actualiza a Premium para agregar más.`);
        return;
      }
    }

    const requestedId = typeof body.repertoireDocId === 'string' && body.repertoireDocId.trim() ? body.repertoireDocId.trim() : '';
    const coverImageUrl = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '';

    const newrepertoireRef = requestedId
      ? getAppFirestore().collection('repertoires').doc(requestedId)
      : getAppFirestore().collection('repertoires').doc();

    await newrepertoireRef.set({
      title,
      songIds,
      ...(songs.length > 0 ? { songs } : {}),
      songsCount: songIds.length,
      sheetsCount: 0,
      isPublic,
      visibility: isPublic ? 'public' : 'private',
      status: isPublic ? 'PUBLISHED' : 'DRAFT',
      liturgicalType,
      type: liturgicalType,
      userId: requestUserId,
      ownerUserId: requestUserId,
      createdBy: requestUserId,
      ...(coverImageUrl ? { coverImageUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    let cloudSqlRepertoireId: number | null = null;
    try {
      const sqlResult = await createRepertoireInCloudSql({
        firebaseUid: requestUserId,
        title,
        liturgicalType,
        coverUrl: coverImageUrl || null,
        songIds: songIds
          .map((value) => Number.parseInt(String(value), 10))
          .filter((value) => Number.isFinite(value) && value > 0),
        userEmail: typeof auth?.token?.email === 'string' ? auth.token.email : null,
        userName: typeof auth?.token?.name === 'string' ? auth.token.name : null
      });
      cloudSqlRepertoireId = sqlResult.id;
    } catch (error) {
      console.error('Cloud SQL repertoire create failed (Firestore already created):', error);
    }

    sendJson(res, 201, {
      ok: true,
      ...(cloudSqlRepertoireId ? { cloudSqlRepertoireId } : {}),
      repertoire: await normalizerepertoireResponse(newrepertoireRef.id, {
        title,
        songIds,
        ...(songs.length > 0 ? { songs } : {}),
        songsCount: songIds.length,
        sheetsCount: 0,
        isPublic,
        liturgicalType,
        userId: requestUserId,
        ownerUserId: requestUserId,
        ...(coverImageUrl ? { coverImageUrl } : {})
      })
    });
    return;
  }

  if (segments.length === 1 && segments[0] === 'song-search' && req.method === 'GET') {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitParam) ? limitParam : 12;

    if (!q) {
      sendJson(res, 200, { options: [] });
      return;
    }

    try {
      const rows = await searchSongsForRepertoire(q, limit);

      const options = rows.map((row) => {
        const artistName = row.versionArtistName ?? row.songArtistName ?? null;

        return {
          songId: String(row.songId),
          versionId: row.versionId ? String(row.versionId) : null,
          title: row.songTitle,
          artistName,
          songArtistName: row.songArtistName,
          versionArtistName: row.versionArtistName,
          versionName: row.versionName,
          instrumentName: row.instrumentName,
          matchType: row.matchType
        };
      });

      sendJson(res, 200, { options });
      return;
    } catch (error) {
      console.error('repertoires song-search failed:', error);
      sendError(res, 500, 'internal_error', 'Song search failed.');
      return;
    }
  }

  if (segments.length === 0) {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  if (segments.length !== 1) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const repertoireId = segments[0];

  let patchUpdate: Record<string, unknown> | null = null;
  if (req.method === 'PATCH') {
    const body = getBodyRecord(req);
    patchUpdate = (body.repertoire ?? {}) as Record<string, unknown>;

    if (typeof patchUpdate.status === 'string' && patchUpdate.status.trim() && !isAdmin) {
      sendError(res, 403, 'forbidden', 'Only admin can update repertoire status.');
      return;
    }
  }

  const repertoireRef = getAppFirestore().collection('repertoires').doc(repertoireId);
  const repertoireSnap = await repertoireRef.get();

  if (!repertoireSnap.exists) {
    sendError(res, 404, 'not_found', 'repertoire not found.');
    return;
  }

  const repertoireData = (repertoireSnap.data() ?? {}) as Record<string, unknown>;

  if (req.method === 'GET') {
    if (!canReadrepertoire(repertoireData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'repertoire is private.');
      return;
    }

    sendJson(res, 200, await normalizerepertoireResponse(repertoireId, repertoireData));
    return;
  }

  if (req.method === 'PATCH') {
    if (!canMutaterepertoire(repertoireData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Only owner can update repertoire.');
      return;
    }

    const update = patchUpdate ?? {};

    const updatedSelectedSongs = Array.isArray(update.songs)
      ? update.songs
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
        .map((value) => {
          const songId = String(value.songId ?? '').trim();
          const versionId = typeof value.versionId === 'string' ? value.versionId.trim() : '';
          return {
            songId,
            ...(versionId ? { versionId } : {})
          };
        })
        .filter((value) => value.songId.length > 0)
      : Array.isArray(repertoireData.songs)
        ? (repertoireData.songs as Array<Record<string, unknown>>)
          .map((value) => {
            const songId = String(value.songId ?? '').trim();
            const versionId = typeof value.versionId === 'string' ? value.versionId.trim() : '';
            return {
              songId,
              ...(versionId ? { versionId } : {})
            };
          })
          .filter((value) => value.songId.length > 0)
        : [];

    const nextSongIds = Array.isArray(update.songIds)
      ? update.songIds.map((value) => String(value))
      : updatedSelectedSongs.length > 0
        ? updatedSelectedSongs.map((value) => value.songId)
        : Array.isArray(repertoireData.songIds)
          ? repertoireData.songIds.map((value) => String(value))
          : [];

    const premiumPatch = await resolveIsPremium(requestUserId!, auth?.token ?? null);
    if (!premiumPatch && nextSongIds.length > FREE_MAX_SONGS_PER_repertoire) {
      sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_SONGS_PER_repertoire} canciones por repertorio. Actualiza a Premium para agregar más.`);
      return;
    }

    const isPublic = typeof update.isPublic === 'boolean'
      ? update.isPublic
      : Boolean(repertoireData.isPublic ?? repertoireData.visibility === 'public');

    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      isPublic,
      visibility: isPublic ? 'public' : 'private',
      songsCount: nextSongIds.length,
      songIds: nextSongIds,
      ...(updatedSelectedSongs.length > 0 ? { songs: updatedSelectedSongs } : {})
    };

    if (typeof update.title === 'string') {
      payload.title = update.title;
    }

    if (typeof update.description === 'string') {
      payload.description = update.description;
    }

    if (typeof update.liturgicalType === 'string') {
      payload.liturgicalType = update.liturgicalType;
      payload.type = update.liturgicalType;
    }

    if (typeof update.coverImageUrl === 'string') {
      payload.coverImageUrl = update.coverImageUrl;
    }

    if (typeof update.status === 'string' && update.status.trim()) {
      payload.status = normalizeRepertoireStatus(update.status, isPublic);
    } else if (isAdmin && isPublic && String(repertoireData.status ?? '').toUpperCase() === 'DRAFT') {
      payload.status = 'PUBLISHED';
    }

    await repertoireRef.set(payload, { merge: true });

    const updatedSnap = await repertoireRef.get();
    sendJson(res, 200, { ok: true, repertoire: await normalizerepertoireResponse(repertoireId, (updatedSnap.data() ?? {}) as Record<string, unknown>) });
    return;
  }

  if (req.method === 'DELETE') {
    if (!canMutaterepertoire(repertoireData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Only owner can delete repertoire.');
      return;
    }

    await repertoireRef.delete();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
});

export const repertoires = repertoiresHandler;
export const Repertoires = repertoiresHandler;

import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { getAppFirestore } from '../../shared/firestore';
import '../../shared/firebaseAdmin';
import {
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

function normalizerepertoireResponse(repertoireId: string, raw: Record<string, unknown>): Record<string, unknown> {
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

  return {
    id: repertoireId,
    title: String(raw.title ?? ''),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    createdBy: String(raw.createdBy ?? raw.userId ?? ''),
    ownerUserId: String(raw.ownerUserId ?? raw.userId ?? ''),
    userId: String(raw.userId ?? raw.ownerUserId ?? ''),
    isPublic,
    visibility: isPublic ? 'public' : 'private',
    liturgicalType: String(raw.liturgicalType ?? raw.type ?? 'General'),
    songsCount: Number(raw.songsCount ?? songIds.length),
    sheetsCount: Number(raw.sheetsCount ?? 0),
    songIds,
    selectedSongs,
    description: String(raw.description ?? '')
  };
}

function canReadrepertoire(repertoire: Record<string, unknown>, requestUserId: string | null): boolean {
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

  // ── GET /repertoires  →  list repertoires by userId or public ──
  if (segments.length === 0 && req.method === 'GET') {
    const db = getAppFirestore();
    const isPublicFilter = typeof req.query.public === 'string' && req.query.public === 'true';

    let repertoiresSnap: FirebaseFirestore.QuerySnapshot;

    if (isPublicFilter) {
      repertoiresSnap = await db
        .collection('repertoires')
        .where('isPublic', '==', true)
        .orderBy('updatedAt', 'desc')
        .limit(100)
        .get();
    } else if (requestUserId) {
      repertoiresSnap = await db
        .collection('repertoires')
        .where('userId', '==', requestUserId)
        .orderBy('updatedAt', 'desc')
        .limit(100)
        .get();
    } else {
      sendError(res, 400, 'invalid_argument', 'userId query param or public=true is required.');
      return;
    }

    const repertoires = repertoiresSnap.docs.map((doc) =>
      normalizerepertoireResponse(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );

    sendJson(res, 200, { repertoires });
    return;
  }

  if (segments.length === 0 && req.method === 'POST') {
    if (!requestUserId) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required to create a repertoire.');
      return;
    }

    const body = getBodyRecord(req);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Sin título';
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

    const newrepertoireRef = getAppFirestore().collection('repertoires').doc();

    await newrepertoireRef.set({
      title,
      songIds,
      ...(songs.length > 0 ? { songs } : {}),
      songsCount: songIds.length,
      sheetsCount: 0,
      isPublic,
      visibility: isPublic ? 'public' : 'private',
      liturgicalType,
      type: liturgicalType,
      userId: requestUserId,
      ownerUserId: requestUserId,
      createdBy: requestUserId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    let cloudSqlRepertoireId: number | null = null;
    try {
      const sqlResult = await createRepertoireInCloudSql({
        firebaseUid: requestUserId,
        title,
        liturgicalType,
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
      repertoire: normalizerepertoireResponse(newrepertoireRef.id, {
        title,
        songIds,
        ...(songs.length > 0 ? { songs } : {}),
        songsCount: songIds.length,
        sheetsCount: 0,
        isPublic,
        liturgicalType,
        userId: requestUserId,
        ownerUserId: requestUserId
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

  const repertoireRef = getAppFirestore().collection('repertoires').doc(repertoireId);
  const repertoireSnap = await repertoireRef.get();

  if (!repertoireSnap.exists) {
    sendError(res, 404, 'not_found', 'repertoire not found.');
    return;
  }

  const repertoireData = (repertoireSnap.data() ?? {}) as Record<string, unknown>;

  if (req.method === 'GET') {
    if (!canReadrepertoire(repertoireData, requestUserId)) {
      sendError(res, 403, 'forbidden', 'repertoire is private.');
      return;
    }

    sendJson(res, 200, normalizerepertoireResponse(repertoireId, repertoireData));
    return;
  }

  if (req.method === 'PATCH') {
    if (!canMutaterepertoire(repertoireData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Only owner can update repertoire.');
      return;
    }

    const body = getBodyRecord(req);
    const update = (body.repertoire ?? {}) as Record<string, unknown>;

    const nextSongIds = Array.isArray(update.songIds)
      ? update.songIds.map((value) => String(value))
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
      songIds: nextSongIds
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

    await repertoireRef.set(payload, { merge: true });

    const updatedSnap = await repertoireRef.get();
    sendJson(res, 200, { ok: true, repertoire: normalizerepertoireResponse(repertoireId, (updatedSnap.data() ?? {}) as Record<string, unknown>) });
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

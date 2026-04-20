import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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
  FREE_MAX_SCHEMAS,
  FREE_MAX_SONGS_PER_SCHEMA,
  countUserSchemas,
  resolveIsPremium
} from '../../shared/plan/planLimits';

function normalizeSchemaResponse(schemaId: string, raw: Record<string, unknown>): Record<string, unknown> {
  const songIds = Array.isArray(raw.songIds) ? raw.songIds.map((value) => String(value)) : [];
  const isPublic = Boolean(raw.isPublic ?? raw.visibility === 'public');

  return {
    id: schemaId,
    title: String(raw.title ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    createdBy: String(raw.createdBy ?? raw.userId ?? ''),
    ownerUserId: String(raw.ownerUserId ?? raw.userId ?? ''),
    userId: String(raw.userId ?? raw.ownerUserId ?? ''),
    isPublic,
    visibility: isPublic ? 'public' : 'private',
    liturgicalType: String(raw.liturgicalType ?? raw.type ?? 'General'),
    songsCount: Number(raw.songsCount ?? songIds.length),
    sheetsCount: Number(raw.sheetsCount ?? 0),
    songIds,
    description: String(raw.description ?? '')
  };
}

function canReadSchema(schema: Record<string, unknown>, requestUserId: string | null): boolean {
  if (requestUserId && String(schema.userId ?? schema.ownerUserId ?? '') === requestUserId) {
    return true;
  }

  return Boolean(schema.isPublic ?? schema.visibility === 'public');
}

function canMutateSchema(schema: Record<string, unknown>, requestUserId: string | null, role?: string): boolean {
  if (role === 'admin') {
    return true;
  }

  if (!requestUserId) {
    return false;
  }

  return String(schema.userId ?? schema.ownerUserId ?? '') === requestUserId;
}

export const schemas = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  const auth = await getOptionalAuthContext(req);
  const requestUserId = resolveRequestUserId(req, auth);

  if (segments.length === 0 && req.method === 'POST') {
    if (!requestUserId) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required to create a schema.');
      return;
    }

    const body = getBodyRecord(req);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Sin título';
    const songIds = Array.isArray(body.songIds) ? body.songIds.map((v) => String(v)) : [];
    const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : false;
    const liturgicalType = typeof body.liturgicalType === 'string' ? body.liturgicalType.trim() : 'General';

    const premium = await resolveIsPremium(requestUserId, auth?.token ?? null);

    if (!premium) {
      const schemaCount = await countUserSchemas(requestUserId);
      if (schemaCount >= FREE_MAX_SCHEMAS) {
        sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_SCHEMAS} esquemas. Actualiza a Premium para crear más.`);
        return;
      }
      if (songIds.length > FREE_MAX_SONGS_PER_SCHEMA) {
        sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_SONGS_PER_SCHEMA} canciones por esquema. Actualiza a Premium para agregar más.`);
        return;
      }
    }

    const newSchemaRef = getFirestore().collection('schemas').doc();

    await newSchemaRef.set({
      title,
      songIds,
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

    sendJson(res, 201, {
      ok: true,
      schema: normalizeSchemaResponse(newSchemaRef.id, {
        title,
        songIds,
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

  if (segments.length !== 1) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const schemaId = segments[0];

  const schemaRef = getFirestore().collection('schemas').doc(schemaId);
  const schemaSnap = await schemaRef.get();

  if (!schemaSnap.exists) {
    sendError(res, 404, 'not_found', 'Schema not found.');
    return;
  }

  const schemaData = (schemaSnap.data() ?? {}) as Record<string, unknown>;

  if (req.method === 'GET') {
    if (!canReadSchema(schemaData, requestUserId)) {
      sendError(res, 403, 'forbidden', 'Schema is private.');
      return;
    }

    sendJson(res, 200, normalizeSchemaResponse(schemaId, schemaData));
    return;
  }

  if (req.method === 'PATCH') {
    if (!canMutateSchema(schemaData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Only owner can update schema.');
      return;
    }

    const body = getBodyRecord(req);
    const update = (body.schema ?? {}) as Record<string, unknown>;

    const nextSongIds = Array.isArray(update.songIds)
      ? update.songIds.map((value) => String(value))
      : Array.isArray(schemaData.songIds)
        ? schemaData.songIds.map((value) => String(value))
        : [];

    const premiumPatch = await resolveIsPremium(requestUserId!, auth?.token ?? null);
    if (!premiumPatch && nextSongIds.length > FREE_MAX_SONGS_PER_SCHEMA) {
      sendError(res, 403, 'plan_limit', `El plan Free permite hasta ${FREE_MAX_SONGS_PER_SCHEMA} canciones por esquema. Actualiza a Premium para agregar más.`);
      return;
    }

    const isPublic = typeof update.isPublic === 'boolean'
      ? update.isPublic
      : Boolean(schemaData.isPublic ?? schemaData.visibility === 'public');

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

    await schemaRef.set(payload, { merge: true });

    const updatedSnap = await schemaRef.get();
    sendJson(res, 200, { ok: true, schema: normalizeSchemaResponse(schemaId, (updatedSnap.data() ?? {}) as Record<string, unknown>) });
    return;
  }

  if (req.method === 'DELETE') {
    if (!canMutateSchema(schemaData, requestUserId, auth?.token.role as string | undefined)) {
      sendError(res, 403, 'forbidden', 'Only owner can delete schema.');
      return;
    }

    await schemaRef.delete();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
});

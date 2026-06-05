import * as functions from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import { getAppFirestore } from '../../shared/firestore';
import {
  getBodyRecord,
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  sendError,
  sendJson
} from '../../shared/http/http';

interface MisalSummary {
  id: string;
  title: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  createdBy: string | null;
  createdAt: string | null;
}

function extractMisalIdFromStoragePath(storagePath: string, weekId: string): string | null {
  const prefix = `misal/${weekId}/`;
  if (!storagePath.startsWith(prefix)) {
    return null;
  }

  const remainder = storagePath.slice(prefix.length).trim();
  if (!remainder || remainder.includes('/')) {
    return null;
  }

  return remainder;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.toISOString();
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeMisalDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): MisalSummary {
  const data = (doc.data() ?? {}) as Record<string, unknown>;

  return {
    id: doc.id,
    title: typeof data.title === 'string' && data.title.trim().length > 0 ? data.title.trim() : 'Misal Semanal',
    downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : '',
    storagePath: typeof data.storagePath === 'string' ? data.storagePath : '',
    fileName: typeof data.fileName === 'string' ? data.fileName : 'misal-semanal.pdf',
    weekId: typeof data.weekId === 'string' ? data.weekId : '',
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : '',
    weekEnd: typeof data.weekEnd === 'string' ? data.weekEnd : '',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
    createdAt: toIsoString(data.createdAt)
  };
}

export const misales = functions.https.onRequest(async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  const segments = getPathSegments(req);
  if (segments.length > 0) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const db = getAppFirestore();

  if (req.method === 'GET') {
    const limitParam = Number(req.query.limit);
    const max = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), 10)
      : 3;

    const snapshot = await db
      .collection('misales')
      .orderBy('createdAt', 'desc')
      .limit(max)
      .get();

    sendJson(res, 200, {
      ok: true,
      items: snapshot.docs.map(normalizeMisalDoc)
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const auth = await getOptionalAuthContext(req);
  const role = typeof auth?.token.role === 'string' ? auth.token.role : '';
  const canManage = role === 'admin' || role === 'editor';

  if (!auth?.uid || !canManage) {
    sendError(res, 403, 'forbidden', 'Only admin or editor can register weekly misales.');
    return;
  }

  const body = getBodyRecord(req);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const downloadUrl = typeof body.downloadUrl === 'string' ? body.downloadUrl.trim() : '';
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const weekId = typeof body.weekId === 'string' ? body.weekId.trim() : '';
  const weekStart = typeof body.weekStart === 'string' ? body.weekStart.trim() : '';
  const weekEnd = typeof body.weekEnd === 'string' ? body.weekEnd.trim() : '';

  if (!title || !downloadUrl || !storagePath || !fileName || !weekId || !weekStart || !weekEnd) {
    sendError(res, 400, 'invalid_argument', 'title, downloadUrl, storagePath, fileName, weekId, weekStart and weekEnd are required.');
    return;
  }

  const misalId = extractMisalIdFromStoragePath(storagePath, weekId);
  if (!misalId) {
    sendError(res, 400, 'invalid_argument', 'storagePath must match misal/{weekId}/{misalId}.');
    return;
  }

  const misalRef = db.collection('misales').doc(misalId);
  await misalRef.set({
    title,
    downloadUrl,
    storagePath,
    fileName,
    weekId,
    weekStart,
    weekEnd,
    createdBy: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  const savedSnap = await misalRef.get();
  sendJson(res, 200, {
    ok: true,
    item: normalizeMisalDoc(savedSnap as FirebaseFirestore.QueryDocumentSnapshot)
  });
});
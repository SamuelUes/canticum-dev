
import { deleteObject, getDownloadURL, getMetadata, listAll, ref, uploadBytes, type StorageReference } from 'firebase/storage';
import { auth, storage } from '../../services/firebase';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';

const MAX_MISAL_SIZE_MB = 18;
const MAX_MISAL_SIZE_BYTES = MAX_MISAL_SIZE_MB * 1024 * 1024;

export interface WeeklyMisalRecord {
  id: string;
  title: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface UploadWeeklyMisalParams {
  title: string;
  file: File;
}

export interface UploadWeeklyMisalResult {
  ok: boolean;
  misal?: WeeklyMisalRecord;
  error?: string;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(reference: Date): Date {
  const start = new Date(reference);
  const day = start.getDay();
  const mondayOffset = (day + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function buildWeeklyMisalRange(reference = new Date()): {
  weekId: string;
  weekStart: Date;
  weekEnd: Date;
  weekStartKey: string;
  weekEndKey: string;
} {
  const weekStart = startOfWeek(reference);
  const weekEnd = endOfWeek(weekStart);

  return {
    weekId: `${formatDateKey(weekStart)}__${formatDateKey(weekEnd)}`,
    weekStart,
    weekEnd,
    weekStartKey: formatDateKey(weekStart),
    weekEndKey: formatDateKey(weekEnd)
  };
}

function normalizeFileTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildDownloadFileName(title: string, weekId: string): string {
  const safeTitle = normalizeFileTitle(title) || 'misal-semanal';
  return `${safeTitle}-${weekId}.pdf`;
}

function validatePdfFile(file: File): string | null {
  const mimeType = file.type.trim().toLowerCase();
  const fileName = file.name.trim().toLowerCase();
  const isPdfMime = mimeType === 'application/pdf';
  const isPdfExtension = fileName.endsWith('.pdf');

  if (!isPdfMime && !isPdfExtension) {
    return 'Solo se permiten archivos PDF.';
  }

  if (file.size > MAX_MISAL_SIZE_BYTES) {
    return `El PDF supera ${MAX_MISAL_SIZE_MB}MB.`;
  }

  return null;
}

function parseWeekIdToRange(weekId: string): { weekStart: string; weekEnd: string } {
  const [start, end] = weekId.split('__');
  return {
    weekStart: start || '',
    weekEnd: end || ''
  };
}

function normalizeApiItem(raw: unknown): WeeklyMisalRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : '';
  const downloadUrl = typeof item.downloadUrl === 'string' ? item.downloadUrl : '';
  const storagePath = typeof item.storagePath === 'string' ? item.storagePath : '';
  if (!id || !downloadUrl || !storagePath) {
    return null;
  }

  const weekId = typeof item.weekId === 'string' ? item.weekId : '';
  const range = parseWeekIdToRange(weekId);

  return {
    id,
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Misal Semanal',
    downloadUrl,
    storagePath,
    fileName: typeof item.fileName === 'string' ? item.fileName : 'misal-semanal.pdf',
    weekId,
    weekStart: typeof item.weekStart === 'string' ? item.weekStart : range.weekStart,
    weekEnd: typeof item.weekEnd === 'string' ? item.weekEnd : range.weekEnd,
    createdBy: typeof item.createdBy === 'string' ? item.createdBy : null,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
  };
}

async function fetchLatestWeeklyMisalesFromApi(limitCount = 3): Promise<WeeklyMisalRecord[]> {
  if (!functionsBaseUrl) {
    return [];
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const endpoint = `${functionsBaseUrl}/misales?limit=${encodeURIComponent(String(limitCount))}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { items?: unknown };
    if (!Array.isArray(payload.items)) {
      return [];
    }

    return payload.items
      .map((entry) => normalizeApiItem(entry))
      .filter((entry): entry is WeeklyMisalRecord => entry !== null)
      .slice(0, limitCount);
  } catch {
    return [];
  }
}

function parseStoragePath(path: string): { weekId: string; misalId: string } {
  const segments = path.split('/').filter(Boolean);
  return {
    weekId: segments[1] ?? '',
    misalId: segments[2] ?? ''
  };
}

function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function collectStorageLeafItems(root: StorageReference, cap: number): Promise<Array<{ path: string; name: string }>> {
  const queue: StorageReference[] = [root];
  const items: Array<{ path: string; name: string }> = [];

  while (queue.length > 0 && items.length < cap * 8) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    let listed;
    try {
      listed = await listAll(current);
    } catch {
      continue;
    }

    queue.push(...listed.prefixes);

    listed.items.forEach((itemRef: StorageReference) => {
      items.push({ path: itemRef.fullPath, name: itemRef.name });
    });
  }

  return items;
}

async function fetchLatestWeeklyMisalesFromStorage(limitCount = 3): Promise<WeeklyMisalRecord[]> {
  if (!storage) {
    return [];
  }

  try {
    const root = ref(storage, 'misal');
    const candidates = await collectStorageLeafItems(root, limitCount);

    const resolved = await Promise.all(
      candidates.slice(0, 30).map(async (candidate) => {
        try {
          const objectRef = ref(storage, candidate.path);
          const [url, metadata] = await Promise.all([
            getDownloadURL(objectRef),
            getMetadata(objectRef)
          ]);

          const { weekId, misalId } = parseStoragePath(candidate.path);
          const range = parseWeekIdToRange(weekId);
          const updatedAt = metadata.updated || metadata.timeCreated || null;

          return {
            id: misalId || candidate.name,
            title: 'Misal Semanal',
            downloadUrl: url,
            storagePath: candidate.path,
            fileName: candidate.name.endsWith('.pdf') ? candidate.name : `${candidate.name}.pdf`,
            weekId,
            weekStart: range.weekStart,
            weekEnd: range.weekEnd,
            createdBy: null,
            createdAt: updatedAt
          } as WeeklyMisalRecord;
        } catch {
          return null;
        }
      })
    );

    return resolved
      .filter((entry): entry is WeeklyMisalRecord => entry !== null)
      .sort((a, b) => timestampOf(b.createdAt) - timestampOf(a.createdAt))
      .slice(0, limitCount);
  } catch {
    return [];
  }
}

export async function listLatestWeeklyMisales(limitCount = 3): Promise<WeeklyMisalRecord[]> {
  const fromApi = await fetchLatestWeeklyMisalesFromApi(limitCount);
  if (fromApi.length > 0) {
    return fromApi;
  }

  return fetchLatestWeeklyMisalesFromStorage(limitCount);
}

export async function uploadWeeklyMisal({ title, file }: UploadWeeklyMisalParams): Promise<UploadWeeklyMisalResult> {
  if (!storage) {
    return { ok: false, error: 'Firebase no esta configurado correctamente.' };
  }

  if (!auth?.currentUser) {
    return { ok: false, error: 'Debes iniciar sesion para subir el misal.' };
  }

  const safeTitle = title.trim();
  if (!safeTitle) {
    return { ok: false, error: 'El titulo es obligatorio.' };
  }

  const fileValidationError = validatePdfFile(file);
  if (fileValidationError) {
    return { ok: false, error: fileValidationError };
  }

  const range = buildWeeklyMisalRange();
  const provisionalId = Math.random().toString(36).slice(2, 12);
  const storagePath = `misal/${range.weekId}/${provisionalId}`;
  const fileName = buildDownloadFileName(safeTitle, range.weekId);
  const objectRef = ref(storage, storagePath);

  try {
    await auth.currentUser.getIdToken(true);
    await uploadBytes(objectRef, file, {
      contentType: 'application/pdf',
      contentDisposition: `attachment; filename="${fileName.replace(/"/g, "'")}"`
    });

    const downloadUrl = await getDownloadURL(objectRef);

    if (!functionsBaseUrl) {
      return {
        ok: true,
        misal: {
          id: provisionalId,
          title: safeTitle,
          downloadUrl,
          storagePath,
          fileName,
          weekId: range.weekId,
          weekStart: range.weekStartKey,
          weekEnd: range.weekEndKey,
          createdBy: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        }
      };
    }

    const headers = await buildFunctionsHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/misales`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: safeTitle,
        downloadUrl,
        storagePath,
        fileName,
        weekId: range.weekId,
        weekStart: range.weekStartKey,
        weekEnd: range.weekEndKey
      })
    });

    if (!response.ok) {
      let backendMessage = 'No se pudo registrar el misal semanal.';
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload.error?.message) {
          backendMessage = payload.error.message;
        }
      } catch {
      }
      throw new Error(backendMessage);
    }

    const payload = (await response.json()) as { item?: unknown };
    const normalized = normalizeApiItem(payload.item);

    return {
      ok: true,
      misal: normalized ?? {
        id: provisionalId,
        title: safeTitle,
        downloadUrl,
        storagePath,
        fileName,
        weekId: range.weekId,
        weekStart: range.weekStartKey,
        weekEnd: range.weekEndKey,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      }
    };
  } catch (error) {
    try {
      await deleteObject(objectRef);
    } catch {
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('storage/unauthorized')) {
      return { ok: false, error: 'Sin permisos para subir misales. Verifica que tu cuenta sea admin o moderador.' };
    }
    if (message.includes('storage/unauthenticated')) {
      return { ok: false, error: 'Tu sesion expiro. Inicia sesion otra vez e intentalo de nuevo.' };
    }

    return { ok: false, error: message || 'No se pudo subir el misal. Intenta nuevamente.' };
  }
}
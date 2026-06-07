import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../services/firebase';

const MAX_AUDIO_SIZE_MB = 10;
const MAX_AUDIO_SIZE_BYTES = MAX_AUDIO_SIZE_MB * 1024 * 1024;
const MAX_LYRICS_SIZE_MB = 2;
const MAX_LYRICS_SIZE_BYTES = MAX_LYRICS_SIZE_MB * 1024 * 1024;
const MAX_SHEET_SIZE_MB = 8;
const MAX_SHEET_SIZE_BYTES = MAX_SHEET_SIZE_MB * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a'
]);

const ALLOWED_LYRICS_TYPES = new Set([
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const ALLOWED_SHEET_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/xml',
  'text/xml',
  'text/plain',
  'application/vnd.recordare.musicxml',
  'application/vnd.recordare.musicxml+xml',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed'
]);

const ALLOWED_SHEET_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'xml', 'musicxml', 'mxl', 'doc', 'docx', 'mscz', 'mscx', 'txt']);

export type VersionAssetKind = 'audio' | 'lyrics' | 'sheet';

export interface UploadAssetResult {
  ok: boolean;
  url?: string;
  path?: string;
  error?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function buildInstrumentationAssetPath(
  songId: string,
  versionId: string,
  instrumentationId: string,
  assetType: 'audio' | 'lyrics' | 'sheet',
  fileName: string
): string {
  const safeSongId = sanitizePathSegment(songId);
  const safeVersionId = sanitizePathSegment(versionId);
  const safeInstrumentationId = sanitizePathSegment(instrumentationId);
  const safeFileName = sanitizePathSegment(fileName);
  return `songs/${safeSongId}/versions/${safeVersionId}/instrumentations/${safeInstrumentationId}/${assetType}/${safeFileName}`;
}

function inferExt(file: File, fallback: string): string {
  if (file.name.includes('.')) {
    return file.name.split('.').pop()?.toLowerCase() ?? fallback;
  }
  return fallback;
}

export function validateAudioFile(file: File): string | null {
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return 'Formato inválido. Solo se permiten MP3, WAV o M4A.';
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return `El archivo de audio supera ${MAX_AUDIO_SIZE_MB}MB.`;
  }
  return null;
}

export function validateLyricsFile(file: File): string | null {
  if (!ALLOWED_LYRICS_TYPES.has(file.type)) {
    return 'Formato inválido. Solo se permiten TXT, PDF o DOC/DOCX.';
  }
  if (file.size > MAX_LYRICS_SIZE_BYTES) {
    return `El archivo de letra supera ${MAX_LYRICS_SIZE_MB}MB.`;
  }
  return null;
}

export function validateSheetFile(file: File): string | null {
  const mimeType = file.type.trim().toLowerCase();
  const fileExt = inferExt(file, '').trim().toLowerCase();
  const hasAllowedMime = mimeType.length > 0 && ALLOWED_SHEET_TYPES.has(mimeType);
  const hasAllowedExt = fileExt.length > 0 && ALLOWED_SHEET_EXTENSIONS.has(fileExt);

  if (!hasAllowedMime && !hasAllowedExt) {
    return 'Formato inválido. Solo se permiten PDF, PNG, JPG, XML, MXL, DOC, DOCX, MSCZ, MSCX o TXT.';
  }
  if (file.size > MAX_SHEET_SIZE_BYTES) {
    return `El archivo de partitura supera ${MAX_SHEET_SIZE_MB}MB.`;
  }
  return null;
}

function validateFor(kind: VersionAssetKind, file: File): string | null {
  if (kind === 'audio') return validateAudioFile(file);
  if (kind === 'lyrics') return validateLyricsFile(file);
  return validateSheetFile(file);
}

function defaultExtFor(kind: VersionAssetKind, file: File): string {
  if (kind === 'audio') {
    if (file.type.includes('wav')) return 'wav';
    if (file.type.includes('m4a') || file.type.includes('mp4')) return 'm4a';
    return 'mp3';
  }
  if (kind === 'lyrics') {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.includes('word')) return 'docx';
    return 'txt';
  }
  // sheet
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'application/xml' || file.type === 'text/xml' || file.type === 'application/vnd.recordare.musicxml+xml') {
    return 'xml';
  }
  if (file.type === 'application/vnd.recordare.musicxml' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    return 'mxl';
  }
  if (file.name.toLowerCase().endsWith('.mxl')) return 'mxl';
  if (file.name.toLowerCase().endsWith('.musicxml') || file.name.toLowerCase().endsWith('.xml')) return 'xml';
  return 'jpg';
}

export interface UploadVersionAssetParams {
  file: File;
  songId: string;
  versionId: string;
  kind: VersionAssetKind;
  filenameBase?: string;
}

/**
 * Uploads a per-version asset to:
 *   songs/{songId}/versions/{versionId}/{kind}/{filenameBase}-{ts}.{ext}
 * and returns the public download URL.
 */
export async function uploadVersionAsset({
  file,
  songId,
  versionId,
  kind,
  filenameBase
}: UploadVersionAssetParams): Promise<UploadAssetResult> {
  if (!storage) {
    return { ok: false, error: 'Firebase Storage no está configurado.' };
  }

  const safeSongId = songId.trim();
  const safeVersionId = versionId.trim();
  if (!safeSongId || !safeVersionId) {
    return { ok: false, error: 'Faltan songId o versionId para subir el archivo.' };
  }

  const validationError = validateFor(kind, file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const now = Date.now();
  const ext = inferExt(file, defaultExtFor(kind, file));
  const safeBase = sanitizeFilename(filenameBase ?? kind);
  const path = `songs/${safeSongId}/versions/${safeVersionId}/${kind}/${safeBase}-${now}.${ext}`;

  try {
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, file, { contentType: file.type || undefined });
    const url = await getDownloadURL(objectRef);
    return { ok: true, url, path };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('storage/unauthorized')) {
      return { ok: false, error: 'Sin permisos para subir archivos en Storage. Verifica sesión y reglas.' };
    }
    return { ok: false, error: 'No se pudo subir el archivo. Intenta nuevamente.' };
  }
}

export interface UploadInstrumentationAssetParams {
  file: File;
  songId: string;
  versionId: string;
  instrumentationId: string;
  kind: VersionAssetKind;
  filenameBase?: string;
}

/**
 * Uploads a per-instrumentation asset to:
 *   songs/{songId}/versions/{versionId}/instrumentations/{instrumentationId}/{kind}/{filenameBase}-{ts}.{ext}
 * and returns the public download URL.
 */
export async function uploadInstrumentationAsset({
  file,
  songId,
  versionId,
  instrumentationId,
  kind,
  filenameBase
}: UploadInstrumentationAssetParams): Promise<UploadAssetResult> {
  if (!storage) {
    return { ok: false, error: 'Firebase Storage no está configurado.' };
  }

  const safeSongId = songId.trim();
  const safeVersionId = versionId.trim();
  const safeInstrumentationId = instrumentationId.trim();
  if (!safeSongId || !safeVersionId || !safeInstrumentationId) {
    return { ok: false, error: 'Faltan songId, versionId o instrumentationId para subir el archivo.' };
  }

  const validationError = validateFor(kind, file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const now = Date.now();
  const ext = inferExt(file, defaultExtFor(kind, file));
  const safeBase = sanitizeFilename(filenameBase ?? kind);
  const fileName = `${safeBase}-${now}.${ext}`;
  const path = buildInstrumentationAssetPath(safeSongId, safeVersionId, safeInstrumentationId, kind, fileName);

  try {
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, file, { contentType: file.type || undefined });
    const url = await getDownloadURL(objectRef);
    return { ok: true, url, path };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('storage/unauthorized')) {
      return { ok: false, error: 'Sin permisos para subir archivos en Storage. Verifica sesión y reglas.' };
    }
    return { ok: false, error: 'No se pudo subir el archivo. Intenta nuevamente.' };
  }
}

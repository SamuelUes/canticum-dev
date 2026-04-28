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
  'image/jpg'
]);

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
  if (!ALLOWED_SHEET_TYPES.has(file.type)) {
    return 'Formato inválido. Solo se permiten PDF, PNG o JPG.';
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

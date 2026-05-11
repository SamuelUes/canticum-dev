import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../../services/firebase';
import type { UploadAssetResult } from '../song/versionAssetUpload';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MIN_IMAGE_DIMENSION_PX = 120;
const TARGET_IMAGE_SIZE_PX = 480;

export type CoverEntity = 'songs' | 'albums' | 'repertoires';

export interface UploadCoverImageParams {
  file: File;
  entity: CoverEntity;
  entityId: string;
  versionId?: string;
  filenameBase?: string;
}

export type PrepareCoverImageResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function inferExt(file: File): string {
  if (file.name.includes('.')) {
    return file.name.split('.').pop()?.toLowerCase() ?? 'png';
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function inferOutputType(file: File): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function replaceExtension(name: string, extension: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return `${name}.${extension}`;
  return `${name.slice(0, idx)}.${extension}`;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function toBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      0.92
    );
  });
}

export function validateCoverImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Formato inválido. Usa PNG, JPG o WEBP.';
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `La imagen supera ${MAX_IMAGE_SIZE_MB}MB.`;
  }

  return null;
}

export async function prepareCoverImageFile(file: File): Promise<PrepareCoverImageResult> {
  const validationError = validateCoverImageFile(file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    const image = await loadImageFromFile(file);

    if (image.naturalWidth < MIN_IMAGE_DIMENSION_PX || image.naturalHeight < MIN_IMAGE_DIMENSION_PX) {
      return { ok: false, error: 'La imagen debe tener al menos 120x120 píxeles.' };
    }

    const squareSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.floor((image.naturalWidth - squareSize) / 2);
    const sourceY = Math.floor((image.naturalHeight - squareSize) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_IMAGE_SIZE_PX;
    canvas.height = TARGET_IMAGE_SIZE_PX;

    const context = canvas.getContext('2d');
    if (!context) {
      return { ok: false, error: 'No se pudo preparar la imagen en el navegador.' };
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      sourceX,
      sourceY,
      squareSize,
      squareSize,
      0,
      0,
      TARGET_IMAGE_SIZE_PX,
      TARGET_IMAGE_SIZE_PX
    );

    const outputType = inferOutputType(file);
    const blob = await toBlob(canvas, outputType);
    const outputExt = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg';
    const outputName = replaceExtension(file.name || 'cover.jpg', outputExt);

    return {
      ok: true,
      file: new File([blob], outputName, {
        type: outputType,
        lastModified: Date.now()
      })
    };
  } catch {
    return { ok: false, error: 'No se pudo procesar la imagen. Intenta con otra portada.' };
  }
}

export async function uploadCoverImage({
  file,
  entity,
  entityId,
  versionId,
  filenameBase
}: UploadCoverImageParams): Promise<UploadAssetResult> {
  if (!storage) {
    return { ok: false, error: 'Firebase Storage no está configurado.' };
  }

  if (!auth?.currentUser) {
    return { ok: false, error: 'Debes iniciar sesión para subir portadas.' };
  }

  const safeEntityId = entityId.trim();
  const safeVersionId = typeof versionId === 'string' ? versionId.trim() : '';
  if (!safeEntityId) {
    return { ok: false, error: 'Falta el identificador para subir la portada.' };
  }

  const validationError = validateCoverImageFile(file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const prepared = await prepareCoverImageFile(file);
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }

  const normalizedFile = prepared.file;

  const safeBase = sanitizeFilename(filenameBase ?? 'cover') || 'cover';
  const ext = inferExt(normalizedFile);
  const path = safeVersionId
    ? `${entity}/${safeEntityId}/versions/${safeVersionId}/cover/${safeBase}.${ext}`
    : `${entity}/${safeEntityId}/cover/${safeBase}.${ext}`;

  try {
    await auth.currentUser.getIdToken(true);
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, normalizedFile, { contentType: normalizedFile.type || undefined });
    const url = await getDownloadURL(objectRef);
    return { ok: true, url, path };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('storage/unauthorized')) {
      return { ok: false, error: 'Sin permisos para subir portadas. Verifica tu sesión.' };
    }
    if (message.includes('storage/unauthenticated')) {
      return { ok: false, error: 'Tu sesión expiró. Inicia sesión nuevamente e inténtalo de nuevo.' };
    }

    return { ok: false, error: 'No se pudo subir la portada. Intenta nuevamente.' };
  }
}

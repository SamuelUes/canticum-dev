export function buildSongStoragePath(songId: string, fileName: string): string {
  return `songs/${songId}/${fileName}`;
}

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function buildVersionAssetPath(
  songId: string,
  versionId: string,
  assetType: 'audio' | 'lyrics' | 'sheet',
  fileName: string
): string {
  const safeSongId = sanitizePathSegment(songId);
  const safeVersionId = sanitizePathSegment(versionId);
  const safeFileName = sanitizePathSegment(fileName);
  return `songs/${safeSongId}/versions/${safeVersionId}/${assetType}/${safeFileName}`;
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

export function buildSongAssetPath(songId: string, assetType: 'lyrics' | 'audio' | 'sheet', fileName: string, variant?: string): string {
  const safeSongId = sanitizePathSegment(songId);
  const safeFileName = sanitizePathSegment(fileName);
  const safeVariant = variant ? sanitizePathSegment(variant) : '';

  if (assetType === 'audio') {
    const audioVariant = safeVariant || 'reference';
    return `songs/${safeSongId}/audio/${audioVariant}/${safeFileName}`;
  }

  if (assetType === 'lyrics') {
    return `songs/${safeSongId}/lyrics/${safeFileName}`;
  }

  return `songs/${safeSongId}/sheet/${safeFileName}`;
}

export function buildStoragePublicUrl(bucketName: string, objectPath: string): string {
  const safeBucket = sanitizePathSegment(bucketName);
  const safePath = objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://storage.googleapis.com/${safeBucket}/${safePath}`;
}

export function buildCdnUrl(cdnBaseUrl: string | undefined, objectPath: string, fallbackBucketName?: string): string | null {
  const safePath = objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');

  if (cdnBaseUrl && cdnBaseUrl.trim()) {
    return `${cdnBaseUrl.replace(/\/$/, '')}/${safePath}`;
  }

  if (fallbackBucketName && fallbackBucketName.trim()) {
    return buildStoragePublicUrl(fallbackBucketName, objectPath);
  }

  return null;
}

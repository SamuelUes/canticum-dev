import * as functions from 'firebase-functions';
import { getStorage } from 'firebase-admin/storage';
import '../../shared/firebaseAdmin';
import { buildCdnUrl, buildSongAssetPath, buildStoragePublicUrl } from '../../shared/storage';

interface SongAssetUploadPayload {
  songId: string;
  assetType: 'lyrics' | 'audio' | 'sheet';
  fileName: string;
  variant?: string;
  contentType?: string;
}

function canUpload(role?: string): boolean {
  return role === 'admin' || role === 'editor';
}

export const getSongAssetUploadUrl = functions.https.onCall(async (data: SongAssetUploadPayload, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
  }

  const role = context.auth.token.role as string | undefined;

  if (!canUpload(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Editor or admin role required.');
  }

  const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
  const assetType = data?.assetType;
  const fileName = typeof data?.fileName === 'string' ? data.fileName.trim() : '';
  const contentType = typeof data?.contentType === 'string' ? data.contentType.trim() : 'application/octet-stream';

  if (!songId || !assetType || !fileName) {
    throw new functions.https.HttpsError('invalid-argument', 'songId, assetType and fileName are required.');
  }

  const objectPath = buildSongAssetPath(songId, assetType, fileName, data.variant);
  const bucket = getStorage().bucket();
  const file = bucket.file(objectPath);

  const expiresAt = Date.now() + 10 * 60 * 1000;
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType
  });

  const bucketName = bucket.name;
  const publicUrl = buildStoragePublicUrl(bucketName, objectPath);
  const cdnUrl = buildCdnUrl(process.env.CDN_BASE_URL, objectPath, bucketName);

  return {
    ok: true,
    songId,
    assetType,
    objectPath,
    contentType,
    uploadUrl,
    expiresAt,
    publicUrl,
    cdnUrl
  };
});

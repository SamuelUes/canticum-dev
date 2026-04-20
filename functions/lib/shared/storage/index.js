"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSongStoragePath = buildSongStoragePath;
exports.buildSongAssetPath = buildSongAssetPath;
exports.buildStoragePublicUrl = buildStoragePublicUrl;
exports.buildCdnUrl = buildCdnUrl;
function buildSongStoragePath(songId, fileName) {
    return `songs/${songId}/${fileName}`;
}
function sanitizePathSegment(value) {
    return value.trim().replace(/^\/+|\/+$/g, '');
}
function buildSongAssetPath(songId, assetType, fileName, variant) {
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
function buildStoragePublicUrl(bucketName, objectPath) {
    const safeBucket = sanitizePathSegment(bucketName);
    const safePath = objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `https://storage.googleapis.com/${safeBucket}/${safePath}`;
}
function buildCdnUrl(cdnBaseUrl, objectPath, fallbackBucketName) {
    const safePath = objectPath.split('/').map((part) => encodeURIComponent(part)).join('/');
    if (cdnBaseUrl && cdnBaseUrl.trim()) {
        return `${cdnBaseUrl.replace(/\/$/, '')}/${safePath}`;
    }
    if (fallbackBucketName && fallbackBucketName.trim()) {
        return buildStoragePublicUrl(fallbackBucketName, objectPath);
    }
    return null;
}
//# sourceMappingURL=index.js.map
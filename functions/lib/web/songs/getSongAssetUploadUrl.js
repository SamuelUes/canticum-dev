"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSongAssetUploadUrl = void 0;
const functions = __importStar(require("firebase-functions"));
const storage_1 = require("firebase-admin/storage");
require("../../shared/firebaseAdmin");
const storage_2 = require("../../shared/storage");
function canUpload(role) {
    return role === 'admin' || role === 'editor';
}
exports.getSongAssetUploadUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
    }
    const role = context.auth.token.role;
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
    const objectPath = (0, storage_2.buildSongAssetPath)(songId, assetType, fileName, data.variant);
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(objectPath);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType
    });
    const bucketName = bucket.name;
    const publicUrl = (0, storage_2.buildStoragePublicUrl)(bucketName, objectPath);
    const cdnUrl = (0, storage_2.buildCdnUrl)(process.env.CDN_BASE_URL, objectPath, bucketName);
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
//# sourceMappingURL=getSongAssetUploadUrl.js.map
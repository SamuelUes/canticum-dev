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
exports.createSchema = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
exports.createSchema = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
    }
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title) {
        throw new functions.https.HttpsError('invalid-argument', 'title is required.');
    }
    const songIds = Array.isArray(data.songIds)
        ? data.songIds.filter((songId) => typeof songId === 'string' && songId.trim().length > 0)
        : [];
    const uid = context.auth.uid;
    const isPublic = Boolean(data.isPublic);
    const schemaRef = (0, firestore_1.getFirestore)().collection('schemas').doc();
    await schemaRef.set({
        userId: uid,
        ownerUserId: uid,
        createdBy: uid,
        title,
        description: typeof data.description === 'string' ? data.description : '',
        liturgicalType: typeof data.liturgicalType === 'string' ? data.liturgicalType : 'General',
        type: typeof data.liturgicalType === 'string' ? data.liturgicalType : 'General',
        isPublic,
        visibility: isPublic ? 'public' : 'private',
        songIds,
        songsCount: songIds.length,
        sheetsCount: 0,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    return {
        ok: true,
        schemaId: schemaRef.id
    };
});
//# sourceMappingURL=createSchema.js.map
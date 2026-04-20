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
exports.addSongToSchema = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
exports.addSongToSchema = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
    }
    const schemaId = typeof data?.schemaId === 'string' ? data.schemaId.trim() : '';
    const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
    if (!schemaId || !songId) {
        throw new functions.https.HttpsError('invalid-argument', 'schemaId and songId are required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const schemaRef = db.collection('schemas').doc(schemaId);
    const schemaSnap = await schemaRef.get();
    if (!schemaSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Schema not found.');
    }
    const schemaData = (schemaSnap.data() ?? {});
    const ownerUserId = String(schemaData.userId ?? schemaData.ownerUserId ?? '');
    if (context.auth.token.role !== 'admin' && ownerUserId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Only owner can update schema songs.');
    }
    const songIds = Array.isArray(schemaData.songIds)
        ? schemaData.songIds.map((value) => String(value))
        : [];
    if (!songIds.includes(songId)) {
        songIds.push(songId);
    }
    await schemaRef.set({
        songIds,
        songsCount: songIds.length,
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    return {
        ok: true,
        schemaId,
        songsCount: songIds.length
    };
});
//# sourceMappingURL=addSongToSchema.js.map
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
exports.approveSong = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
function canApprove(role) {
    return role === 'admin' || role === 'curador' || role === 'curator';
}
exports.approveSong = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
    }
    const role = context.auth.token.role;
    if (!canApprove(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Curator or admin role required.');
    }
    const songId = typeof data?.songId === 'string' ? data.songId.trim() : '';
    if (!songId) {
        throw new functions.https.HttpsError('invalid-argument', 'songId is required.');
    }
    const songRef = (0, firestore_1.getFirestore)().collection('songs').doc(songId);
    const songSnap = await songRef.get();
    if (!songSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Song not found.');
    }
    const songData = (songSnap.data() ?? {});
    const status = String(songData.status ?? '').toUpperCase();
    if (status !== 'IN_REVIEW') {
        throw new functions.https.HttpsError('failed-precondition', 'Only songs in IN_REVIEW can be approved.');
    }
    await songRef.set({
        status: 'APPROVED',
        approvedAt: firestore_1.FieldValue.serverTimestamp(),
        approvedBy: context.auth.uid,
        reviewNotes: typeof data.note === 'string' ? data.note : songData.reviewNotes ?? '',
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    return {
        ok: true,
        songId,
        status: 'APPROVED'
    };
});
//# sourceMappingURL=approveSong.js.map
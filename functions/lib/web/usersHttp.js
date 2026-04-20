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
exports.users = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../shared/firebaseAdmin");
const http_1 = require("../shared/http");
function canAccessUser(authUid, targetUserId, role) {
    if (role === 'admin') {
        return true;
    }
    return Boolean(authUid && authUid === targetUserId);
}
exports.users = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    if (segments.length !== 3 || segments[1] !== 'favorites') {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const userId = segments[0];
    const songId = segments[2];
    if (!userId || !songId) {
        (0, http_1.sendError)(res, 400, 'invalid_argument', 'userId and songId are required.');
        return;
    }
    const auth = await (0, http_1.getOptionalAuthContext)(req);
    if (!canAccessUser(auth?.uid ?? null, userId, auth?.token.role)) {
        (0, http_1.sendError)(res, 401, 'unauthorized', 'Authenticated user required.');
        return;
    }
    const favoriteRef = (0, firestore_1.getFirestore)().collection('users').doc(userId).collection('favorites').doc(songId);
    if (req.method === 'GET') {
        const favoriteSnap = await favoriteRef.get();
        if (!favoriteSnap.exists) {
            (0, http_1.sendError)(res, 404, 'not_found', 'Favorite not found.');
            return;
        }
        (0, http_1.sendJson)(res, 200, { isFavorite: true });
        return;
    }
    if (req.method === 'PUT') {
        await favoriteRef.set({
            songId,
            isFavorite: true,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        (0, http_1.sendJson)(res, 200, { ok: true });
        return;
    }
    if (req.method === 'DELETE') {
        await favoriteRef.delete();
        (0, http_1.sendJson)(res, 200, { ok: true });
        return;
    }
    (0, http_1.sendError)(res, 405, 'method_not_allowed', 'Method not allowed.');
});
//# sourceMappingURL=usersHttp.js.map
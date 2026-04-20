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
exports.artists = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
const http_1 = require("../../shared/http");
function buildSongRow(docId, data) {
    return {
        id: docId,
        title: String(data.title ?? ''),
        thumbnailUrl: typeof data.thumbnailUrl === 'string' && data.thumbnailUrl ? data.thumbnailUrl : undefined,
        views: Number(data.views ?? data.viewCount ?? 0),
        tone: String(data.tone ?? data.defaultTone ?? ''),
        hasLyrics: Boolean(data.hasLyrics ?? (typeof data.lyrics === 'string' && data.lyrics.length > 0)),
        hasSheet: Boolean(data.hasSheet ?? (typeof data.sheetUrl === 'string' && data.sheetUrl.length > 0)),
        isVerified: Boolean(data.isVerified)
    };
}
exports.artists = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    if (req.method !== 'GET') {
        (0, http_1.sendError)(res, 405, 'method_not_allowed', 'Method not allowed.');
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    if (segments.length !== 1) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const artistId = segments[0];
    const db = (0, firestore_1.getFirestore)();
    const [artistSnap, songsSnap] = await Promise.all([
        db.collection('artists').doc(artistId).get(),
        db.collection('songs')
            .where('artistId', '==', artistId)
            .where('status', '==', 'PUBLISHED')
            .orderBy('views', 'desc')
            .limit(20)
            .get()
    ]);
    if (!artistSnap.exists) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Artist not found.');
        return;
    }
    const artistData = (artistSnap.data() ?? {});
    const songs = songsSnap.docs.map((doc) => buildSongRow(doc.id, (doc.data() ?? {})));
    const highlightedSongs = songs.slice(0, 6).map((s) => s.id);
    (0, http_1.sendJson)(res, 200, {
        id: artistSnap.id,
        name: String(artistData.name ?? ''),
        bio: String(artistData.bio ?? ''),
        ministryType: String(artistData.ministryType ?? artistData.type ?? 'General'),
        imageUrl: typeof artistData.imageUrl === 'string' ? artistData.imageUrl : undefined,
        songsCount: Number(artistData.songsCount ?? songs.length),
        highlightedSongs,
        songs
    });
});
//# sourceMappingURL=http.js.map
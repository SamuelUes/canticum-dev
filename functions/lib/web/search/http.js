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
exports.search = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
const http_1 = require("../../shared/http");
exports.search = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    if (req.method !== 'GET') {
        (0, http_1.sendError)(res, 405, 'method_not_allowed', 'Method not allowed.');
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    if (segments.length !== 1 || segments[0] !== 'catalog') {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const auth = await (0, http_1.getOptionalAuthContext)(req);
    const currentUserId = auth?.uid ?? null;
    const db = (0, firestore_1.getFirestore)();
    const kindFilter = typeof req.query.kind === 'string' ? req.query.kind : '';
    const [songsSnap, schemasSnap, artistsSnap] = await Promise.all([
        kindFilter && kindFilter !== 'song'
            ? Promise.resolve({ docs: [] })
            : db.collection('songs').where('status', '==', 'PUBLISHED').orderBy('publishedAt', 'desc').limit(40).get(),
        kindFilter && kindFilter !== 'schema'
            ? Promise.resolve({ docs: [] })
            : db.collection('schemas').limit(60).get(),
        kindFilter && kindFilter !== 'artist'
            ? Promise.resolve({ docs: [] })
            : db.collection('artists').limit(30).get()
    ]);
    const items = [];
    songsSnap.docs.forEach((doc) => {
        const data = doc.data();
        items.push({
            id: doc.id,
            kind: 'song',
            title: String(data.title ?? ''),
            subtitle: String(data.author ?? data.artistName ?? ''),
            songId: doc.id,
            liturgicalType: String(data.liturgicalType ?? data.liturgical_use ?? 'General'),
            liturgicalTime: String(data.liturgicalTime ?? 'Ordinario'),
            authorOrChoir: String(data.author ?? data.artistName ?? 'General'),
            searchableText: `${String(data.title ?? '')} ${String(data.author ?? data.artistName ?? '')}`.trim(),
            isPremium: Boolean(data.isPremium)
        });
    });
    schemasSnap.docs.forEach((doc) => {
        const data = doc.data();
        const ownerUserId = String(data.userId ?? data.ownerUserId ?? '');
        const isPublic = Boolean(data.isPublic ?? data.visibility === 'public');
        if (!isPublic && ownerUserId !== currentUserId) {
            return;
        }
        const songIds = Array.isArray(data.songIds) ? data.songIds : [];
        items.push({
            id: doc.id,
            kind: 'schema',
            schemaId: doc.id,
            title: String(data.title ?? ''),
            subtitle: String(data.liturgicalType ?? data.type ?? 'Esquema'),
            liturgicalType: String(data.liturgicalType ?? data.type ?? 'General'),
            liturgicalTime: String(data.liturgicalTime ?? 'Ordinario'),
            authorOrChoir: 'Schema',
            searchableText: `${String(data.title ?? '')} ${String(data.liturgicalType ?? data.type ?? '')}`.trim(),
            dateLabel: String(data.updatedAt ?? data.createdAt ?? 'N/D'),
            songsCount: Number(data.songsCount ?? songIds.length),
            sheetsCount: Number(data.sheetsCount ?? 0),
            ownerUserId,
            isPublic
        });
    });
    artistsSnap.docs.forEach((doc) => {
        const data = doc.data();
        items.push({
            id: doc.id,
            kind: 'artist',
            artistId: doc.id,
            title: String(data.name ?? ''),
            subtitle: String(data.ministryType ?? data.type ?? 'Artista'),
            liturgicalType: 'General',
            liturgicalTime: 'Ordinario',
            authorOrChoir: String(data.name ?? ''),
            searchableText: `${String(data.name ?? '')} ${String(data.bio ?? '')}`.trim(),
            songsCount: Number(data.songsCount ?? 0)
        });
    });
    const liturgicalTypes = new Set();
    const liturgicalTimes = new Set();
    const authorOrChoirs = new Set();
    items.forEach((item) => {
        liturgicalTypes.add(item.liturgicalType || 'General');
        liturgicalTimes.add(item.liturgicalTime || 'Ordinario');
        authorOrChoirs.add(item.authorOrChoir || 'General');
    });
    (0, http_1.sendJson)(res, 200, {
        items,
        filters: {
            liturgicalTypes: Array.from(liturgicalTypes),
            liturgicalTimes: Array.from(liturgicalTimes),
            authorOrChoirs: Array.from(authorOrChoirs)
        }
    });
});
//# sourceMappingURL=http.js.map
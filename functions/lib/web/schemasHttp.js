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
exports.schemas = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../shared/firebaseAdmin");
const http_1 = require("../shared/http");
function normalizeSchemaResponse(schemaId, raw) {
    const songIds = Array.isArray(raw.songIds) ? raw.songIds.map((value) => String(value)) : [];
    const isPublic = Boolean(raw.isPublic ?? raw.visibility === 'public');
    return {
        id: schemaId,
        title: String(raw.title ?? ''),
        createdAt: String(raw.createdAt ?? ''),
        createdBy: String(raw.createdBy ?? raw.userId ?? ''),
        ownerUserId: String(raw.ownerUserId ?? raw.userId ?? ''),
        userId: String(raw.userId ?? raw.ownerUserId ?? ''),
        isPublic,
        visibility: isPublic ? 'public' : 'private',
        liturgicalType: String(raw.liturgicalType ?? raw.type ?? 'General'),
        songsCount: Number(raw.songsCount ?? songIds.length),
        sheetsCount: Number(raw.sheetsCount ?? 0),
        songIds,
        description: String(raw.description ?? '')
    };
}
function canReadSchema(schema, requestUserId) {
    if (requestUserId && String(schema.userId ?? schema.ownerUserId ?? '') === requestUserId) {
        return true;
    }
    return Boolean(schema.isPublic ?? schema.visibility === 'public');
}
function canMutateSchema(schema, requestUserId, role) {
    if (role === 'admin') {
        return true;
    }
    if (!requestUserId) {
        return false;
    }
    return String(schema.userId ?? schema.ownerUserId ?? '') === requestUserId;
}
exports.schemas = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    if (segments.length !== 1) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const schemaId = segments[0];
    const auth = await (0, http_1.getOptionalAuthContext)(req);
    const requestUserId = (0, http_1.resolveRequestUserId)(req, auth);
    const schemaRef = (0, firestore_1.getFirestore)().collection('schemas').doc(schemaId);
    const schemaSnap = await schemaRef.get();
    if (!schemaSnap.exists) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Schema not found.');
        return;
    }
    const schemaData = (schemaSnap.data() ?? {});
    if (req.method === 'GET') {
        if (!canReadSchema(schemaData, requestUserId)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Schema is private.');
            return;
        }
        (0, http_1.sendJson)(res, 200, normalizeSchemaResponse(schemaId, schemaData));
        return;
    }
    if (req.method === 'PATCH') {
        if (!canMutateSchema(schemaData, requestUserId, auth?.token.role)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Only owner can update schema.');
            return;
        }
        const body = (0, http_1.getBodyRecord)(req);
        const update = (body.schema ?? {});
        const nextSongIds = Array.isArray(update.songIds)
            ? update.songIds.map((value) => String(value))
            : Array.isArray(schemaData.songIds)
                ? schemaData.songIds.map((value) => String(value))
                : [];
        const isPublic = typeof update.isPublic === 'boolean'
            ? update.isPublic
            : Boolean(schemaData.isPublic ?? schemaData.visibility === 'public');
        const payload = {
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            isPublic,
            visibility: isPublic ? 'public' : 'private',
            songsCount: nextSongIds.length,
            songIds: nextSongIds
        };
        if (typeof update.title === 'string') {
            payload.title = update.title;
        }
        if (typeof update.description === 'string') {
            payload.description = update.description;
        }
        if (typeof update.liturgicalType === 'string') {
            payload.liturgicalType = update.liturgicalType;
            payload.type = update.liturgicalType;
        }
        await schemaRef.set(payload, { merge: true });
        const updatedSnap = await schemaRef.get();
        (0, http_1.sendJson)(res, 200, { ok: true, schema: normalizeSchemaResponse(schemaId, (updatedSnap.data() ?? {})) });
        return;
    }
    if (req.method === 'DELETE') {
        if (!canMutateSchema(schemaData, requestUserId, auth?.token.role)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Only owner can delete schema.');
            return;
        }
        await schemaRef.delete();
        (0, http_1.sendJson)(res, 200, { ok: true });
        return;
    }
    (0, http_1.sendError)(res, 405, 'method_not_allowed', 'Method not allowed.');
});
//# sourceMappingURL=schemasHttp.js.map
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
exports.songs = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
const http_1 = require("../../shared/http");
function isOwnerOrAdmin(targetUserId, authUid, role) {
    if (role === 'admin') {
        return true;
    }
    return Boolean(authUid && authUid === targetUserId);
}
function normalizePreferencePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return {};
    }
    const raw = payload;
    return {
        currentVersionId: typeof raw.currentVersionId === 'string' ? raw.currentVersionId : undefined,
        currentInstrumentId: typeof raw.currentInstrumentId === 'string' ? raw.currentInstrumentId : undefined
    };
}
function isPremiumVersion(version) {
    return Boolean(version.isPremium);
}
exports.songs = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    if (!segments.length) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const songId = segments[0];
    const authContext = await (0, http_1.getOptionalAuthContext)(req);
    const requestUserId = (0, http_1.resolveRequestUserId)(req, authContext);
    const db = (0, firestore_1.getFirestore)();
    if (segments.length === 1 && req.method === 'GET') {
        const songSnap = await db.collection('songs').doc(songId).get();
        if (!songSnap.exists) {
            (0, http_1.sendError)(res, 404, 'not_found', 'Song not found.');
            return;
        }
        const songData = (songSnap.data() ?? {});
        const versionsSnap = await songSnap.ref.collection('versions').get();
        const userDocSnap = requestUserId ? await db.collection('users').doc(requestUserId).get() : null;
        const userData = (userDocSnap?.data() ?? {});
        const isPremiumUser = Boolean(authContext?.token.premium ?? userData.premium ?? false);
        const songUnlockSnap = requestUserId
            ? await db.collection('users').doc(requestUserId).collection('songUnlocks').doc(songId).get()
            : null;
        const hasSongUnlock = Boolean(songUnlockSnap?.exists);
        const rawVersions = versionsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
        const visibleVersions = rawVersions.filter((version) => {
            if (!isPremiumVersion(version)) {
                return true;
            }
            return isPremiumUser || hasSongUnlock;
        });
        const versions = (visibleVersions.length ? visibleVersions : rawVersions).map((version) => ({
            id: String(version.id),
            songId: String(version.songId ?? songId),
            versionId: String(version.versionId ?? version.id),
            versionName: String(version.versionName ?? version.label ?? 'Versión'),
            artistId: typeof version.artistId === 'string' ? version.artistId : undefined,
            instrumentId: typeof version.instrumentId === 'string' ? version.instrumentId : undefined,
            tone: typeof version.tone === 'string' ? version.tone : undefined,
            notationType: typeof version.notationType === 'string' ? version.notationType : undefined,
            audioReferenceUrl: typeof version.audioReferenceUrl === 'string' ? version.audioReferenceUrl : undefined,
            artistName: String(version.artistName ?? songData.artistName ?? ''),
            instrumentName: typeof version.instrumentName === 'string' ? version.instrumentName : undefined,
            label: String(version.label ?? version.versionName ?? 'Versión'),
            isPremium: Boolean(version.isPremium)
        }));
        const instrumentMap = new Map();
        versions.forEach((version) => {
            if (version.instrumentId) {
                instrumentMap.set(version.instrumentId, {
                    id: version.instrumentId,
                    name: version.instrumentName ?? version.instrumentId
                });
            }
        });
        const currentVersionId = String(songData.currentVersionId ?? versions[0]?.id ?? '');
        const currentInstrumentId = String(songData.currentInstrumentId ?? instrumentMap.values().next().value?.id ?? '');
        (0, http_1.sendJson)(res, 200, {
            id: songSnap.id,
            title: String(songData.title ?? ''),
            artistName: String(songData.artistName ?? songData.author ?? ''),
            author: typeof songData.author === 'string' ? songData.author : undefined,
            year: typeof songData.year === 'number' ? songData.year : undefined,
            status: String(songData.status ?? 'draft').toLowerCase(),
            createdBy: String(songData.createdBy ?? ''),
            lyrics: String(songData.lyrics ?? ''),
            sheet: typeof songData.sheet === 'string' ? songData.sheet : undefined,
            audioUrl: typeof songData.audioUrl === 'string' ? songData.audioUrl : undefined,
            currentVersionId,
            currentInstrumentId,
            userAccess: {
                isAuthenticated: Boolean(authContext?.uid),
                isPremiumUser,
                hasSongUnlock,
                canPurchaseIndividually: Boolean(songData.canPurchaseIndividually),
                individualPriceUsd: typeof songData.individualPriceUsd === 'number' ? songData.individualPriceUsd : undefined
            },
            versions,
            instruments: Array.from(instrumentMap.values())
        });
        return;
    }
    if (segments.length === 2 && segments[1] === 'preferences' && req.method === 'GET') {
        if (!requestUserId) {
            (0, http_1.sendError)(res, 400, 'invalid_argument', 'userId is required.');
            return;
        }
        if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Cannot read preferences for another user.');
            return;
        }
        const preferenceSnap = await db.collection('users').doc(requestUserId).collection('songPreferences').doc(songId).get();
        if (!preferenceSnap.exists) {
            (0, http_1.sendJson)(res, 200, { preferences: {} });
            return;
        }
        const preferenceData = preferenceSnap.data();
        const preferences = normalizePreferencePayload(preferenceData.preferences ?? preferenceData);
        (0, http_1.sendJson)(res, 200, preferences);
        return;
    }
    if (segments.length === 2 && segments[1] === 'preferences' && req.method === 'POST') {
        const body = (0, http_1.getBodyRecord)(req);
        const rawPreferences = normalizePreferencePayload(body.preferences);
        if (!requestUserId) {
            (0, http_1.sendError)(res, 400, 'invalid_argument', 'userId is required.');
            return;
        }
        if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Cannot update preferences for another user.');
            return;
        }
        await db.collection('users').doc(requestUserId).collection('songPreferences').doc(songId).set({
            userId: requestUserId,
            songId,
            preferences: rawPreferences,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        (0, http_1.sendJson)(res, 200, { ok: true });
        return;
    }
    if (segments.length === 2 && segments[1] === 'purchase-intent' && req.method === 'POST') {
        if (!requestUserId) {
            (0, http_1.sendError)(res, 400, 'invalid_argument', 'userId is required.');
            return;
        }
        if (!isOwnerOrAdmin(requestUserId, authContext?.uid ?? null, authContext?.token.role)) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Cannot create purchase intent for another user.');
            return;
        }
        const checkoutBaseUrl = (process.env.CHECKOUT_BASE_URL ?? 'https://checkout.canticum.app/session').replace(/\/$/, '');
        const checkoutUrl = `${checkoutBaseUrl}/${encodeURIComponent(songId)}?uid=${encodeURIComponent(requestUserId)}`;
        await db.collection('users').doc(requestUserId).collection('purchaseIntents').doc(songId).set({
            songId,
            userId: requestUserId,
            status: 'pending',
            checkoutUrl,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        (0, http_1.sendJson)(res, 200, { checkoutUrl });
        return;
    }
    (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
});
//# sourceMappingURL=http.js.map
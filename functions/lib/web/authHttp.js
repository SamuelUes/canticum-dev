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
exports.auth = void 0;
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
require("../shared/firebaseAdmin");
const http_1 = require("../shared/http");
function buildProfileFromRequest(req) {
    const body = (0, http_1.getBodyRecord)(req);
    const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'user';
    const plan = typeof body.plan === 'string' && body.plan.trim() ? body.plan.trim() : 'free';
    const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : undefined;
    return {
        role,
        plan,
        displayName,
        premium: plan.toLowerCase().includes('premium')
    };
}
async function upsertUserProfile(uid, data) {
    const authUser = await (0, auth_1.getAuth)().getUser(uid);
    const userRef = (0, firestore_1.getFirestore)().collection('users').doc(uid);
    await userRef.set({
        role: data.role,
        plan: data.plan,
        premium: data.premium,
        email: authUser.email ?? null,
        displayName: data.displayName ?? authUser.displayName ?? null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        lastLoginAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    await userRef.collection('private').doc('meta').set({
        emailVerified: authUser.emailVerified,
        providerData: authUser.providerData.map((provider) => provider.providerId),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    }, { merge: true });
    return {
        uid,
        email: authUser.email ?? null,
        displayName: data.displayName ?? authUser.displayName ?? null,
        role: data.role,
        plan: data.plan,
        premium: data.premium
    };
}
exports.auth = functions.https.onRequest(async (req, res) => {
    if ((0, http_1.handlePreflight)(req, res)) {
        return;
    }
    if (req.method !== 'POST') {
        (0, http_1.sendError)(res, 405, 'method_not_allowed', 'Method not allowed.');
        return;
    }
    const segments = (0, http_1.getPathSegments)(req);
    const action = segments[0];
    if (!action) {
        (0, http_1.sendError)(res, 404, 'not_found', 'Endpoint not found.');
        return;
    }
    const authContext = await (0, http_1.getOptionalAuthContext)(req);
    const body = (0, http_1.getBodyRecord)(req);
    if (action === 'validate') {
        const requestUid = (0, http_1.getBodyString)(req, 'uid') ?? authContext?.uid ?? null;
        const requestEmail = (0, http_1.getBodyString)(req, 'email');
        if (!requestUid && !requestEmail) {
            (0, http_1.sendError)(res, 400, 'invalid_argument', 'uid or email is required.');
            return;
        }
        try {
            const authUser = requestUid
                ? await (0, auth_1.getAuth)().getUser(requestUid)
                : await (0, auth_1.getAuth)().getUserByEmail(String(requestEmail));
            const profileSnap = await (0, firestore_1.getFirestore)().collection('users').doc(authUser.uid).get();
            (0, http_1.sendJson)(res, 200, {
                exists: true,
                uid: authUser.uid,
                email: authUser.email ?? null,
                profileExists: profileSnap.exists,
                profile: profileSnap.exists ? profileSnap.data() : null
            });
            return;
        }
        catch {
            (0, http_1.sendJson)(res, 200, {
                exists: false
            });
            return;
        }
    }
    if (action === 'register') {
        const requestUid = (0, http_1.getBodyString)(req, 'uid') ?? authContext?.uid ?? null;
        if (!requestUid) {
            (0, http_1.sendError)(res, 401, 'unauthorized', 'Authenticated user required to register profile.');
            return;
        }
        const canCreateForAnotherUser = authContext?.token.role === 'admin';
        if (authContext?.uid && authContext.uid !== requestUid && !canCreateForAnotherUser) {
            (0, http_1.sendError)(res, 403, 'forbidden', 'Cannot register profile for another user.');
            return;
        }
        const profile = buildProfileFromRequest(req);
        try {
            const createdProfile = await upsertUserProfile(requestUid, profile);
            if (authContext?.token.role === 'admin' && typeof body.role === 'string') {
                await (0, auth_1.getAuth)().setCustomUserClaims(requestUid, {
                    role: profile.role,
                    premium: profile.premium
                });
            }
            (0, http_1.sendJson)(res, 200, {
                ok: true,
                user: createdProfile
            });
            return;
        }
        catch (error) {
            functions.logger.error('auth/register failed', error);
            (0, http_1.sendError)(res, 500, 'internal', 'Unable to register user profile.');
            return;
        }
    }
    if (action === 'login') {
        if (!authContext?.uid) {
            (0, http_1.sendError)(res, 401, 'unauthorized', 'Valid ID token required.');
            return;
        }
        const userRef = (0, firestore_1.getFirestore)().collection('users').doc(authContext.uid);
        const currentSnap = await userRef.get();
        const current = currentSnap.data() ?? {};
        const role = typeof current.role === 'string' ? current.role : 'user';
        const plan = typeof current.plan === 'string' ? current.plan : 'free';
        const premium = Boolean(current.premium ?? authContext.token.premium);
        await userRef.set({
            role,
            plan,
            premium,
            email: authContext.token.email ?? null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            lastLoginAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        (0, http_1.sendJson)(res, 200, {
            ok: true,
            user: {
                uid: authContext.uid,
                email: authContext.token.email ?? null,
                role,
                plan,
                premium
            },
            claims: {
                role: authContext.token.role ?? role,
                premium: Boolean(authContext.token.premium ?? premium)
            }
        });
        return;
    }
    (0, http_1.sendError)(res, 404, 'not_found', 'Auth endpoint not found.');
});
//# sourceMappingURL=authHttp.js.map
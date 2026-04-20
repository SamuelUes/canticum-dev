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
exports.getSubscriptionStatus = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
require("../../shared/firebaseAdmin");
exports.getSubscriptionStatus = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authenticated user required.');
    }
    const uid = context.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = (userSnap.data() ?? {});
    const inlineSubscription = (userData.subscription ?? {});
    let plan = typeof inlineSubscription.plan === 'string' ? inlineSubscription.plan : null;
    let status = typeof inlineSubscription.status === 'string' ? inlineSubscription.status : null;
    let platform = typeof inlineSubscription.platform === 'string' ? inlineSubscription.platform : null;
    let expiresAt = typeof inlineSubscription.expiresAt === 'string' ? inlineSubscription.expiresAt : null;
    if (!plan || !status) {
        const subsSnap = await db
            .collection('subscriptions')
            .where('userId', '==', uid)
            .orderBy('updatedAt', 'desc')
            .limit(1)
            .get();
        if (!subsSnap.empty) {
            const subscriptionDoc = subsSnap.docs[0].data();
            plan = typeof subscriptionDoc.plan === 'string' ? subscriptionDoc.plan : plan;
            status = typeof subscriptionDoc.status === 'string' ? subscriptionDoc.status : status;
            platform = typeof subscriptionDoc.platform === 'string' ? subscriptionDoc.platform : platform;
            expiresAt = typeof subscriptionDoc.expiresAt === 'string' ? subscriptionDoc.expiresAt : expiresAt;
        }
    }
    const premiumFromClaim = Boolean(context.auth.token.premium);
    const premiumFromPlan = typeof plan === 'string' && plan.toLowerCase().includes('premium');
    const premiumFromStatus = status === 'active';
    return {
        ok: true,
        uid,
        premium: premiumFromClaim || (premiumFromPlan && premiumFromStatus),
        subscription: {
            plan: plan ?? 'free',
            status: status ?? 'inactive',
            platform: platform ?? 'web',
            expiresAt
        }
    };
});
//# sourceMappingURL=getSubscriptionStatus.js.map
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
exports.setUserClaims = void 0;
const functions = __importStar(require("firebase-functions"));
const auth_1 = require("firebase-admin/auth");
require("../firebaseAdmin");
exports.setUserClaims = functions.https.onCall(async (data, context) => {
    const auth = context.auth;
    if (!auth || auth.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only admin can assign custom claims.');
    }
    if (!data || !data.uid) {
        throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
    }
    const role = data.role ?? 'user';
    const premium = data.premium ?? false;
    await (0, auth_1.getAuth)().setCustomUserClaims(data.uid, { role, premium });
    return {
        success: true,
        uid: data.uid,
        claims: { role, premium }
    };
});
//# sourceMappingURL=setUserClaims.js.map
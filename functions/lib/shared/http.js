"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCors = applyCors;
exports.handlePreflight = handlePreflight;
exports.sendJson = sendJson;
exports.sendError = sendError;
exports.getPathSegments = getPathSegments;
exports.getBodyRecord = getBodyRecord;
exports.getBodyString = getBodyString;
exports.getQueryString = getQueryString;
exports.getOptionalAuthContext = getOptionalAuthContext;
exports.resolveRequestUserId = resolveRequestUserId;
const auth_1 = require("firebase-admin/auth");
function applyCors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
function handlePreflight(req, res) {
    applyCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
}
function sendJson(res, status, payload) {
    applyCors(res);
    res.status(status).json(payload);
}
function sendError(res, status, code, message) {
    sendJson(res, status, {
        error: {
            code,
            message
        }
    });
}
function getPathSegments(req) {
    return req.path
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
}
function getBodyRecord(req) {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        return req.body;
    }
    return {};
}
function getBodyString(req, key) {
    const value = getBodyRecord(req)[key];
    return typeof value === 'string' ? value : undefined;
}
function getQueryString(req, key) {
    const value = req.query[key];
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }
    return undefined;
}
async function getOptionalAuthContext(req) {
    const authorization = req.get('Authorization') ?? req.get('authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
        return null;
    }
    try {
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(token);
        return {
            uid: decoded.uid,
            token: decoded
        };
    }
    catch {
        return null;
    }
}
function resolveRequestUserId(req, authContext) {
    const bodyUserId = getBodyString(req, 'userId');
    const queryUserId = getQueryString(req, 'userId');
    return authContext?.uid ?? bodyUserId ?? queryUserId ?? null;
}
//# sourceMappingURL=http.js.map
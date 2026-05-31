import * as functions from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import '../../shared/firebaseAdmin';
import { hasCloudSqlUser, upsertUserInCloudSql } from '../../shared/cloudSql/users';
import { runStartupDiagnostics } from '../../shared/diagnostics';
import { getAppFirestore } from '../../shared/firestore';
import {
  getClientIp,
  getBodyRecord,
  getBodyString,
  getOptionalAuthContext,
  getPathSegments,
  handlePreflight,
  sendError,
  sendJson
} from '../../shared/http/http';
import { applyRateLimitHeaders, checkRateLimit } from '../../shared/rateLimit';

interface UserProfileWrite {
  role: string;
  plan: string;
  email?: string;
  displayName?: string;
  premium: boolean;
  password?: string;
}

function buildProfileFromRequest(req: functions.https.Request): UserProfileWrite {
  const body = getBodyRecord(req);
  const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'user';
  const plan = typeof body.plan === 'string' && body.plan.trim() ? body.plan.trim() : 'free';
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : undefined;

  const password = typeof body.password === 'string' && body.password.trim() ? body.password.trim() : undefined;

  return {
    role,
    plan,
    displayName,
    premium: plan.toLowerCase().includes('premium'),
    password
  };
}

async function upsertUserProfile(uid: string, data: UserProfileWrite): Promise<Record<string, unknown>> {
  const authUser = await getAuth().getUser(uid);
  const userRef = getAppFirestore().collection('users').doc(uid);

  await userRef.set(
    {
      role: data.role,
      plan: data.plan,
      premium: data.premium,
      email: authUser.email ?? null,
      displayName: data.displayName ?? authUser.displayName ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await upsertUserInCloudSql(authUser, data.displayName, data.password);

  await userRef.collection('private').doc('meta').set(
    {
      emailVerified: authUser.emailVerified,
      providerData: authUser.providerData.map((provider) => provider.providerId),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    uid,
    email: authUser.email ?? null,
    displayName: data.displayName ?? authUser.displayName ?? null,
    role: data.role,
    plan: data.plan,
    premium: data.premium
  };
}

export const auth = functions.https.onRequest(async (req, res) => {
  await runStartupDiagnostics();

  if (handlePreflight(req, res)) {
    return;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'auth',
      message: 'Auth endpoint is reachable. Use POST for actions.'
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed.');
    return;
  }

  const segments = getPathSegments(req);
  const action = segments[0];

  if (!action) {
    sendError(res, 404, 'not_found', 'Endpoint not found.');
    return;
  }

  const authContext = await getOptionalAuthContext(req);
  const body = getBodyRecord(req);

  if (action === 'validate') {
    const requestUid = getBodyString(req, 'uid') ?? authContext?.uid ?? null;
    const requestEmail = getBodyString(req, 'email');

    if (!requestUid && !requestEmail) {
      sendError(res, 400, 'invalid_argument', 'uid or email is required.');
      return;
    }

    try {
      const authUser = requestUid
        ? await getAuth().getUser(requestUid)
        : await getAuth().getUserByEmail(String(requestEmail));

      const profileSnap = await getAppFirestore().collection('users').doc(authUser.uid).get();
      const cloudSqlExists = await hasCloudSqlUser(authUser.uid, authUser.email ?? null);

      sendJson(res, 200, {
        exists: true,
        uid: authUser.uid,
        email: authUser.email ?? null,
        cloudSqlExists,
        profileExists: profileSnap.exists,
        profile: profileSnap.exists ? profileSnap.data() : null
      });
      return;
    } catch {
      sendJson(res, 200, {
        exists: false
      });
      return;
    }
  }

  if (action === 'register') {
    const requestUid = getBodyString(req, 'uid') ?? authContext?.uid ?? null;

    if (!requestUid) {
      sendError(res, 401, 'unauthorized', 'Authenticated user required to register profile.');
      return;
    }

    const canCreateForAnotherUser = authContext?.token.role === 'admin';

    if (authContext?.uid && authContext.uid !== requestUid && !canCreateForAnotherUser) {
      sendError(res, 403, 'forbidden', 'Cannot register profile for another user.');
      return;
    }

    const registerLimiterIdentifier = requestUid ?? getClientIp(req) ?? 'anonymous';
    const registerLimiter = await checkRateLimit(registerLimiterIdentifier, 'auth_register', 3, 3600);
    applyRateLimitHeaders(res, 3, registerLimiter);
    if (!registerLimiter.allowed) {
      res.set('Retry-After', String(registerLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Too many register attempts. Retry in ${registerLimiter.retryAfterSeconds}s.`);
      return;
    }

    const profile = buildProfileFromRequest(req);

    try {
      const createdProfile = await upsertUserProfile(requestUid, profile);

      if (authContext?.token.role === 'admin' && typeof body.role === 'string') {
        await getAuth().setCustomUserClaims(requestUid, {
          role: profile.role,
          premium: profile.premium
        });
      }

      sendJson(res, 200, {
        ok: true,
        user: createdProfile
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error('auth/register failed', {
        uid: requestUid,
        error: message
      });

      if (message.includes('Cloud SQL authentication failed')) {
        sendError(res, 500, 'cloudsql_auth_failed', message);
        return;
      }

      if (message.includes('Cloud SQL repertoire mismatch')) {
        sendError(res, 500, 'cloudsql_repertoire_mismatch', message);
        return;
      }

      sendError(res, 500, 'internal', 'Unable to register user profile.');
      return;
    }
  }

  if (action === 'login') {
    if (!authContext?.uid) {
      sendError(res, 401, 'unauthorized', 'Valid ID token required.');
      return;
    }

    const loginLimiterIdentifier = authContext.uid || getClientIp(req) || 'anonymous';
    const loginLimiter = await checkRateLimit(loginLimiterIdentifier, 'auth_login', 20, 600);
    applyRateLimitHeaders(res, 20, loginLimiter);
    if (!loginLimiter.allowed) {
      res.set('Retry-After', String(loginLimiter.retryAfterSeconds));
      sendError(res, 429, 'too_many_requests', `Too many login attempts. Retry in ${loginLimiter.retryAfterSeconds}s.`);
      return;
    }

    const userRef = getAppFirestore().collection('users').doc(authContext.uid);
    const currentSnap = await userRef.get();
    const current = currentSnap.data() ?? {};

    const role = typeof current.role === 'string' ? current.role : 'user';
    const plan = typeof current.plan === 'string' ? current.plan : 'free';
    const premium = Boolean(current.premium ?? authContext.token.premium);
    const authUser = await getAuth().getUser(authContext.uid);

    await upsertUserInCloudSql(authUser, current.displayName as string | undefined);

    await userRef.set(
      {
        role,
        plan,
        premium,
        email: authContext.token.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    sendJson(res, 200, {
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

  sendError(res, 404, 'not_found', 'Auth endpoint not found.');
});

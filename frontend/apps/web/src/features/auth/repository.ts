import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  type User
} from 'firebase/auth';

const functionsBaseUrl = (process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

const hasFirebaseConfig = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

function logRuntimeConnectionStatus(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const runtime = hasFirebaseConfig ? 'firebase' : 'mock-dev';
  const functionsConfigured = Boolean(functionsBaseUrl);

  console.info(`[Canticum/Auth] Runtime=${runtime} | FunctionsConfigured=${functionsConfigured ? 'yes' : 'no'}`);

  if (!hasFirebaseConfig) {
    console.warn('[Canticum/Auth] Firebase no configurado. Se usa modo desarrollo.');
  }

  if (!functionsConfigured) {
    console.warn('[Canticum/Auth] NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL no configurado.');
    return;
  }

  void fetch(`${functionsBaseUrl}/auth`, { method: 'GET' })
    .then((response) => {
      console.info(`[Canticum/Auth] Backend Functions reachable: ${response.status} ${response.statusText}`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Canticum/Auth] Backend Functions unreachable: ${message}`);
    });
}

if (typeof window !== 'undefined') {
  const runtimeKey = '__canticum_runtime_diag_done__';
  const runtimeWindow = window as typeof window & { [key: string]: unknown };
  if (!runtimeWindow[runtimeKey]) {
    runtimeWindow[runtimeKey] = true;
    logRuntimeConnectionStatus();
  }
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: string;
  isPremium?: boolean;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

const DEV_MOCK_EMAIL = 'admin-canticum1402@gmail.com';
const DEV_MOCK_PASSWORD = 'admin-canticum1402';

const DEV_MOCK_USER: AuthUser = {
  uid: 'dev-mock-uid-canticum',
  email: DEV_MOCK_EMAIL,
  displayName: 'Admin Dev Samuel',
  role: 'admin',
  isPremium: true
};

const DEV_SESSION_KEY = '__canticum_dev_session';
const DEV_SIGNED_OUT_KEY = '__canticum_dev_signed_out';

function hasExplicitlySignedOut(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DEV_SIGNED_OUT_KEY) === '1';
}

function setExplicitSignOut(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    window.localStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
  } else {
    window.localStorage.removeItem(DEV_SIGNED_OUT_KEY);
  }
}

function readDevSession(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DEV_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeDevSession(user: AuthUser | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (user) {
    window.localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(DEV_SESSION_KEY);
  }
}

let devMockSession: AuthUser | null = null;

function mapFirebaseUser(user: User, claims?: Record<string, unknown>): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: typeof claims?.role === 'string' ? claims.role : undefined,
    isPremium: Boolean(claims?.premium)
  };
}

async function registerProfileWithBackend(user: User, displayName?: string, password?: string): Promise<void> {
  if (!functionsBaseUrl) {
    throw new Error('Falta configurar NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL para registrar perfil en backend.');
  }

  const token = await user.getIdToken();

  const registerResponse = await fetch(`${functionsBaseUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ uid: user.uid, displayName: displayName ?? user.displayName ?? undefined, password })
  });

  if (!registerResponse.ok) {
    let backendMessage = 'No se pudo registrar el perfil en backend.';

    try {
      const payload = (await registerResponse.json()) as unknown;
      if (payload && typeof payload === 'object') {
        const error = (payload as { error?: { message?: unknown } }).error;
        if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
          backendMessage = error.message;
        }
      }
    } catch {
    }

    throw new Error(backendMessage);
  }

  const registerPayload = (await registerResponse.json()) as unknown;
  const registerOk = Boolean(
    registerPayload
    && typeof registerPayload === 'object'
    && (registerPayload as { ok?: boolean }).ok
  );

  if (!registerOk) {
    throw new Error('El backend no confirmó la creación del perfil.');
  }

  const validateResponse = await fetch(`${functionsBaseUrl}/auth/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ uid: user.uid })
  });

  if (!validateResponse.ok) {
    throw new Error('No se pudo validar el perfil de usuario en backend.');
  }

  const validatePayload = (await validateResponse.json()) as unknown;
  const hasBackendProfile = Boolean(
    validatePayload
    && typeof validatePayload === 'object'
    && (validatePayload as { exists?: boolean }).exists
    && (validatePayload as { profileExists?: boolean }).profileExists
  );

  if (!hasBackendProfile) {
    throw new Error('La cuenta se creó en Auth, pero no quedó perfil en la base de datos.');
  }
}

async function loginWithBackend(user: User): Promise<Record<string, unknown>> {
  if (!functionsBaseUrl) {
    return {};
  }

  try {
    const token = await user.getIdToken();
    const response = await fetch(`${functionsBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === 'object') {
      return (payload as { claims?: Record<string, unknown> }).claims ?? {};
    }
  } catch {
  }

  return {};
}

export async function signUp(email: string, password: string, displayName?: string): Promise<AuthResult> {
  if (!hasFirebaseConfig) {
    if (email === DEV_MOCK_EMAIL) {
      devMockSession = { ...DEV_MOCK_USER, displayName: displayName ?? DEV_MOCK_USER.displayName };
      writeDevSession(devMockSession);
      writeSessionCookie('dev-mock-token');
      return { ok: true, user: devMockSession };
    }

    return { ok: false, error: 'Modo desarrollo: usa ' + DEV_MOCK_EMAIL };
  }

  try {
    const { auth } = await import('../../services/firebase');
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName) {
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(credential.user, { displayName });
    }

    try {
      await registerProfileWithBackend(credential.user, displayName, password);
    } catch (backendErr) {
      await firebaseSignOut(auth);
      return {
        ok: false,
        error: backendErr instanceof Error
          ? backendErr.message
          : 'No se pudo sincronizar el usuario con backend.'
      };
    }

    const tokenResult = await credential.user.getIdTokenResult();
    writeSessionCookie(tokenResult.token);

    return {
      ok: true,
      user: mapFirebaseUser(credential.user, tokenResult.claims as Record<string, unknown>)
    };
  } catch (err) {
    return { ok: false, error: parseFirebaseError(err) };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!hasFirebaseConfig) {
    if (email === DEV_MOCK_EMAIL && password === DEV_MOCK_PASSWORD) {
      devMockSession = DEV_MOCK_USER;
      writeDevSession(devMockSession);
      setExplicitSignOut(false);
      writeSessionCookie('dev-mock-token');
      return { ok: true, user: DEV_MOCK_USER };
    }

    return { ok: false, error: 'Modo desarrollo: usa ' + DEV_MOCK_EMAIL + ' / ' + DEV_MOCK_PASSWORD };
  }

  try {
    const { auth } = await import('../../services/firebase');
    const credential = await signInWithEmailAndPassword(auth, email, password);

    const backendClaims = await loginWithBackend(credential.user);

    if (Object.keys(backendClaims).length > 0) {
      await credential.user.getIdToken(true);
    }

    const tokenResult = await credential.user.getIdTokenResult();
    const mergedClaims = { ...(tokenResult.claims as Record<string, unknown>), ...backendClaims };

    writeSessionCookie(tokenResult.token);

    return {
      ok: true,
      user: mapFirebaseUser(credential.user, mergedClaims)
    };
  } catch (err) {
    return { ok: false, error: parseFirebaseError(err) };
  }
}

export async function signOut(): Promise<void> {
  if (!hasFirebaseConfig) {
    devMockSession = null;
    writeDevSession(null);
    setExplicitSignOut(true);
    clearSessionCookie();
    return;
  }

  const { auth } = await import('../../services/firebase');
  await firebaseSignOut(auth);
  clearSessionCookie();
}

function writeSessionCookie(token: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `__session=${token}; path=/; max-age=${maxAge}; SameSite=Strict`;
}

function clearSessionCookie(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = '__session=; path=/; max-age=0; SameSite=Strict';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!hasFirebaseConfig) {
    return devMockSession;
  }

  try {
    const { auth } = await import('../../services/firebase');
    const user = auth.currentUser;
    if (!user) {
      return null;
    }

    const tokenResult = await user.getIdTokenResult();
    return mapFirebaseUser(user, tokenResult.claims as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  if (!hasFirebaseConfig) {
    const savedSession = readDevSession();
    const signedOut = hasExplicitlySignedOut();
    const session = signedOut ? null : (savedSession ?? DEV_MOCK_USER);

    devMockSession = session;

    if (session) {
      writeDevSession(session);
      writeSessionCookie('dev-mock-token');
    }

    callback(session);
    return () => {};
  }

  let unsubscribe = () => {};

  import('../../services/firebase').then(({ auth }) => {
    unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        clearSessionCookie();
        callback(null);
        return;
      }

      const tokenResult = await firebaseUser.getIdTokenResult();
      writeSessionCookie(tokenResult.token);
      callback(mapFirebaseUser(firebaseUser, tokenResult.claims as Record<string, unknown>));
    });
  }).catch(() => {
    callback(null);
  });

  return () => unsubscribe();
}

function parseFirebaseError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Error desconocido.';
  }

  const code = (err as { code?: string }).code ?? '';

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este correo ya está registrado.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
    'auth/network-request-failed': 'Error de red. Verifica tu conexión.'
  };

  return messages[code] ?? 'Ocurrió un error. Intenta de nuevo.';
}

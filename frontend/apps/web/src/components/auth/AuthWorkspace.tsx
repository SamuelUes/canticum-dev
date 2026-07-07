'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext';
import { signIn, signUp, signInWithGoogle } from '../../features/auth/repository';

type AuthMode = 'login' | 'register';

interface AuthWorkspaceProps {
  redirectTo?: string;
}

const loginrepertoire = z.object({
  email: z.string().email('Correo no válido.'),
  password: z.string().min(6, 'Mínimo 6 caracteres.')
});

const registerrepertoire = loginrepertoire.extend({
  displayName: z.string().max(60, 'Máximo 60 caracteres.').optional()
});

export function AuthWorkspace({ redirectTo = '/' }: AuthWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get('reason') ?? null;
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (!loading && user && !isSubmitting) {
      router.replace(redirectTo);
    }
  }, [user, loading, isSubmitting, redirectTo, router]);

  const isLogin = mode === 'login';
  const passwordsMatch = isLogin || password === confirmPassword;

  if (loading || user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const repertoire = isLogin ? loginrepertoire : registerrepertoire;
    const parsed = repertoire.safeParse({ email, password, displayName: displayName.trim() || undefined });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Datos inválidos.');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);

    const result = isLogin
      ? await signIn(email, password)
      : await signUp(email, password, displayName.trim() || undefined);

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Error desconocido.');
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);

    try {
      const result = await signInWithGoogle();

      if (!result.ok) {
        if (result.error) {
          setError(result.error);
        }
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('No se pudo completar el inicio de sesión con Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <section className="auth-page-layout">
      <div className="auth-card">
        <header className="auth-card-header">
          {reason === 'purchase' ? (
            <div className="auth-reason-banner is-purchase" role="note">
              💳 Necesitas una cuenta para comprar canciones individuales.
            </div>
          ) : reason === 'premium' ? (
            <div className="auth-reason-banner is-premium" role="note">
              ⭐ Crea una cuenta para acceder al plan Premium y desbloquear todo el contenido.
            </div>
          ) : reason === 'create' ? (
            <div className="auth-reason-banner is-premium" role="note">
              ✏️ Inicia sesión o crea una cuenta para subir canciones y crear repertorios.
            </div>
          ) : null}
          <h1 className="auth-title">
            {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
          </h1>
          <p className="auth-subtitle">
            {isLogin
              ? 'Accede a tu cancionero personal.'
              : 'Crea tu cuenta y empieza a organizar tu repertorio.'}
          </p>
        </header>

        <nav className="auth-mode-tabs" aria-label="Modo de autenticación">
          <button
            type="button"
            className={`auth-tab ${isLogin ? 'is-active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`auth-tab ${!isLogin ? 'is-active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Registrarse
          </button>
        </nav>

        <form className="auth-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          {!isLogin ? (
            <label className="auth-field">
              <span>Nombre</span>
              <input
                type="text"
                placeholder="Tu nombre"
                value={displayName}
                autoComplete="name"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>Correo electrónico</span>
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              required
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Contraseña</span>
            <div className="auth-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={isLogin ? 'Tu contraseña' : 'Mínimo 6 caracteres'}
                value={password}
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </label>

          {!isLogin ? (
            <label className="auth-field">
              <span>Confirmar contraseña</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Repite tu contraseña"
                value={confirmPassword}
                required
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
          </label>
          ) : null}

          {!isLogin && confirmPassword && !passwordsMatch ? (
            <p className="auth-error" role="alert">Las contraseñas no coinciden.</p>
          ) : null}

          {error ? (
            <p className="auth-error" role="alert">{error}</p>
          ) : null}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isSubmitting || !email || !password || (!isLogin && (!confirmPassword || !passwordsMatch))}
          >
            {isSubmitting
              ? 'Cargando...'
              : isLogin
                ? 'Entrar'
                : 'Crear cuenta'}
          </button>
        </form>

        <div className="auth-divider">
          <span>o</span>
        </div>

        <button
          type="button"
          className="auth-google-btn"
          onClick={() => void handleGoogleSignIn()}
          disabled={isGoogleLoading || isSubmitting}
        >
          {isGoogleLoading ? (
            <span className="auth-google-spinner" aria-hidden="true" />
          ) : (
            <svg className="auth-google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          <span>Continuar con Google</span>
        </button>

        <footer className="auth-card-footer">
          <p>
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button
              type="button"
              className="auth-toggle-link"
              onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(null); }}
            >
              {isLogin ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </p>
        </footer>
      </div>
    </section>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext';
import { signIn, signUp } from '../../features/auth/repository';

type AuthMode = 'login' | 'register';

interface AuthWorkspaceProps {
  redirectTo?: string;
}

const loginSchema = z.object({
  email: z.string().email('Correo no válido.'),
  password: z.string().min(6, 'Mínimo 6 caracteres.')
});

const registerSchema = loginSchema.extend({
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
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [user, loading, redirectTo, router]);

  const isLogin = mode === 'login';

  if (loading || user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const schema = isLogin ? loginSchema : registerSchema;
    const parsed = schema.safeParse({ email, password, displayName: displayName.trim() || undefined });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Datos inválidos.');
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
            <input
              type="password"
              placeholder={isLogin ? 'Tu contraseña' : 'Mínimo 6 caracteres'}
              value={password}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">{error}</p>
          ) : null}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isSubmitting || !email || !password}
          >
            {isSubmitting
              ? 'Cargando...'
              : isLogin
                ? 'Entrar'
                : 'Crear cuenta'}
          </button>
        </form>

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

'use client';

import Link from 'next/link';
import { useEffect } from 'react';


export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Canticum/Web] Route error boundary:', error);
  }, [error]);

  return (
    <main className="home-page">
      <div className="home-shell" style={{ padding: '4rem 1.5rem' }}>
        <h1 style={{ color: '#133f66', marginBottom: '0.75rem' }}>Ocurrió un error inesperado</h1>
        <p style={{ marginBottom: '1.25rem' }}>
          Puedes intentar recuperar la vista sin reiniciar el servidor.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} className="welcome-trigger" style={{ cursor: 'pointer' }}>
            Reintentar
          </button>
          <Link href="/" className="welcome-trigger">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

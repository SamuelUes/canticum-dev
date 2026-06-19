'use client';

import Link from 'next/link';
import { useEffect } from 'react';


export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Canticum/Web] Global error boundary:', error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="home-page">
          <div className="home-shell" style={{ padding: '4rem 1.5rem' }}>
            <h1 style={{ color: '#133f66', marginBottom: '0.75rem' }}>La app encontró un error global</h1>
            <p style={{ marginBottom: '1.25rem' }}>
              Intenta recuperar la sesión con el botón de reintento.
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
      </body>
    </html>
  );
}

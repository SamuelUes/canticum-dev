'use client';

import { useEffect } from 'react';

function isAbortLikeError(reason: unknown): boolean {
  if (!reason) {
    return false;
  }

  if (typeof reason === 'object' && reason !== null && 'name' in reason && (reason as { name?: unknown }).name === 'AbortError') {
    return true;
  }

  const message = typeof reason === 'string'
    ? reason
    : reason instanceof Error
      ? reason.message
      : '';

  const normalized = message.toLowerCase();
  return normalized.includes('abort') || normalized.includes('aborted');
}

export function RuntimeStabilityGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isAbortLikeError(event.reason)) {
        event.preventDefault();
        return;
      }

      console.error('[Canticum/Web] Unhandled promise rejection:', event.reason);
    };

    const onError = (event: ErrorEvent) => {
      console.error('[Canticum/Web] Global runtime error:', event.error ?? event.message);
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return null;
}

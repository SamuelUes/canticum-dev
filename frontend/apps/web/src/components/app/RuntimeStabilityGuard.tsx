'use client';

import { useEffect } from 'react';

const NEXT_CHUNK_RECOVERY_KEY = '__canticum_next_chunk_recovery_once__';

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

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}

function isNextAssetFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('chunkloaderror') ||
    normalized.includes('loading chunk') ||
    normalized.includes('/_next/static/') ||
    normalized.includes('failed to fetch dynamically imported module')
  );
}

function hasNextAssetFailureInEvent(event: ErrorEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLScriptElement) {
    return target.src.includes('/_next/static/');
  }

  const message = getErrorMessage(event.error ?? event.message);
  return isNextAssetFailure(message);
}

function recoverFromNextAssetFailure(): void {
  try {
    if (window.sessionStorage.getItem(NEXT_CHUNK_RECOVERY_KEY) === '1') {
      return;
    }

    window.sessionStorage.setItem(NEXT_CHUNK_RECOVERY_KEY, '1');
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('_r', String(Date.now()));
    window.location.replace(nextUrl.toString());
  } catch {
    window.location.reload();
  }
}

export function RuntimeStabilityGuard() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(NEXT_CHUNK_RECOVERY_KEY);
    } catch {
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isAbortLikeError(event.reason)) {
        event.preventDefault();
        return;
      }

      if (isNextAssetFailure(getErrorMessage(event.reason))) {
        event.preventDefault();
        console.warn('[Canticum/Web] Recovering from stale Next.js chunk request.');
        recoverFromNextAssetFailure();
        return;
      }

      console.error('[Canticum/Web] Unhandled promise rejection:', event.reason);
    };

    const onError = (event: ErrorEvent) => {
      if (hasNextAssetFailureInEvent(event)) {
        event.preventDefault();
        console.warn('[Canticum/Web] Recovering from Next.js static asset load failure.');
        recoverFromNextAssetFailure();
        return;
      }

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

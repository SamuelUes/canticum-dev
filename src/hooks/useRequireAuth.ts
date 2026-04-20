'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export type AuthReason = 'purchase' | 'premium';

interface UseRequireAuthResult {
  isAuthenticated: boolean;
  requireAuth: (reason?: AuthReason, redirectPath?: string) => boolean;
}

export function useRequireAuth(): UseRequireAuthResult {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const requireAuth = useCallback(
    (reason: AuthReason = 'purchase', redirectPath?: string): boolean => {
      if (user) {
        return true;
      }

      const redirect = redirectPath ?? pathname ?? '/';
      const loginUrl = `/auth?redirect=${encodeURIComponent(redirect)}&reason=${reason}`;
      router.push(loginUrl);
      return false;
    },
    [pathname, router, user]
  );

  return {
    isAuthenticated: Boolean(user),
    requireAuth
  };
}

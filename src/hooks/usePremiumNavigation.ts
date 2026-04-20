'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useRequireAuth } from './useRequireAuth';

interface UsePremiumNavigationResult {
  isAuthenticated: boolean;
  openPremiumPlans: () => boolean;
}

export function usePremiumNavigation(): UsePremiumNavigationResult {
  const router = useRouter();
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();

  const openPremiumPlans = useCallback(() => {
    if (!requireAuth('premium', '/suscripciones')) {
      return false;
    }

    router.push('/suscripciones');
    return true;
  }, [requireAuth, router]);

  return {
    isAuthenticated: Boolean(user),
    openPremiumPlans
  };
}

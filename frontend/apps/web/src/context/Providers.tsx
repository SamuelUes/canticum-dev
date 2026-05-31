'use client';

import type { ReactNode } from 'react';
import { RuntimeStabilityGuard } from '../components/app/RuntimeStabilityGuard';
import { AuthProvider } from './AuthContext';
import { AppSkeletonThemeProvider } from './SkeletonThemeProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AppSkeletonThemeProvider>
        <RuntimeStabilityGuard />
        {children}
      </AppSkeletonThemeProvider>
    </AuthProvider>
  );
}

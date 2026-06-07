'use client';

import type { ReactNode } from 'react';
import { RuntimeStabilityGuard } from '../components/app/RuntimeStabilityGuard';
import { AudioProvider } from './AudioContext';
import { AuthProvider } from './AuthContext';
import { AppSkeletonThemeProvider } from './SkeletonThemeProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AudioProvider>
        <AppSkeletonThemeProvider>
          <RuntimeStabilityGuard />
          {children}
        </AppSkeletonThemeProvider>
      </AudioProvider>
    </AuthProvider>
  );
}

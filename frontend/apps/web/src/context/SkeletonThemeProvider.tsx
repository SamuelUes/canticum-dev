'use client';

import type { ReactNode } from 'react';
import { SkeletonTheme } from 'react-loading-skeleton';

interface SkeletonThemeProviderProps {
  children: ReactNode;
}

export function AppSkeletonThemeProvider({ children }: SkeletonThemeProviderProps) {
  return (
    <SkeletonTheme baseColor="#eceff2" highlightColor="#f7f9fb" duration={1.2}>
      {children}
    </SkeletonTheme>
  );
}

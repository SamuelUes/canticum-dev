'use client';

import type { ReactNode } from 'react';
import { SkeletonTheme } from 'react-loading-skeleton';

interface SkeletonThemeProviderProps {
  children: ReactNode;
}

export function AppSkeletonThemeProvider({ children }: SkeletonThemeProviderProps) {
  return (
    <SkeletonTheme 
      baseColor="var(--surface-container-low)" 
      highlightColor="var(--surface-container)" 
      duration={1.5}
    >
      {children}
    </SkeletonTheme>
  );
}

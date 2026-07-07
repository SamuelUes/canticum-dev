'use client';

import { usePathname } from 'next/navigation';
import { FloatingAudioPlayer, useAudioPlayerPlacement } from '../audio/FloatingAudioPlayer';
import { useIsMobile } from '../../hooks/useMediaQuery';

export function FloatingPlayerWrapper() {
  const pathname = usePathname();
  const placement = useAudioPlayerPlacement();
  const isMobile = useIsMobile();

  // Hide floating player on song detail pages (unless mobile, where inline player is hidden)
  const isSongPage = /^\/songs\/[^/]+$/.test(pathname);

  if (placement === 'header') {
    return null;
  }

  if (isSongPage && !isMobile) {
    return null;
  }

  return <FloatingAudioPlayer placement="floating" />;
}

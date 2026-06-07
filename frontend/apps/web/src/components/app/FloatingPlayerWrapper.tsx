'use client';

import { usePathname } from 'next/navigation';
import { FloatingAudioPlayer } from '../audio/FloatingAudioPlayer';

export function FloatingPlayerWrapper() {
  const pathname = usePathname();
  
  // Hide floating player on song detail pages
  const isSongPage = /^\/songs\/[^/]+$/.test(pathname);
  
  if (isSongPage) {
    return null;
  }
  
  return <FloatingAudioPlayer />;
}

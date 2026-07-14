'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LoadingBubble } from '../ui/LoadingBubble';
import { usePathname } from 'next/navigation';
import { useAudio } from '../../context/AudioContext';
import type { repertoireDetail } from '../../types/repertoire';

interface RepertoirePlaybackContextValue {
  isPlaybackMode: boolean;
  enterPlaybackMode: () => void;
  exitPlaybackMode: () => void;
}

const RepertoirePlaybackContext = createContext<RepertoirePlaybackContextValue>({
  isPlaybackMode: false,
  enterPlaybackMode: () => {},
  exitPlaybackMode: () => {}
});

interface RepertoirePageClientProps {
  repertoire: repertoireDetail;
  children: ReactNode;
}

export function RepertoirePageClient({ children }: RepertoirePageClientProps) {
  const pathname = usePathname();
  const { queue, queueSource } = useAudio();
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsHydrating(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Close playback mode when navigating away
  useEffect(() => {
    setIsPlaybackMode(false);
  }, [pathname]);

  // Close playback mode if queue is cleared or source changes
  useEffect(() => {
    if (queue.length === 0 || queueSource !== 'repertoire') {
      setIsPlaybackMode(false);
    }
  }, [queue.length, queueSource]);

  const enterPlaybackMode = () => {
    setIsPlaybackMode(true);
  };

  const exitPlaybackMode = () => {
    setIsPlaybackMode(false);
  };

  return (
    <RepertoirePlaybackContext.Provider value={{ isPlaybackMode, enterPlaybackMode, exitPlaybackMode }}>
      <LoadingBubble isLoading={isHydrating} message="Cargando repertorio…" />
      {children}
    </RepertoirePlaybackContext.Provider>
  );
}

export function useRepertoirePlayback() {
  return useContext(RepertoirePlaybackContext);
}

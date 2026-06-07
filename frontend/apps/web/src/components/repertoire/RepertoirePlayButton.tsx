'use client';

import { PlayQueueButton } from '../audio/PlayQueueButton';
import { useRepertoirePlayback } from './RepertoirePageClient';

interface RepertoirePlayButtonProps {
  songIds: Array<{ songId: string; versionId?: string }>;
  className?: string;
}

export function RepertoirePlayButton({ songIds, className }: RepertoirePlayButtonProps) {
  const { enterPlaybackMode } = useRepertoirePlayback();

  return (
    <PlayQueueButton
      songIds={songIds}
      source="repertoire"
      className={className}
      onPlay={enterPlaybackMode}
    />
  );
}

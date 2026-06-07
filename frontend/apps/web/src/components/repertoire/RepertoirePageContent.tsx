'use client';

import { useRepertoirePlayback } from './RepertoirePageClient';
import { RepertoirePlaybackSidebar } from './RepertoirePlaybackSidebar';
import { RepertoireSongViewer } from './RepertoireSongViewer';
import type { repertoireDetail, SongRef } from '../../types/repertoire';

interface RepertoirePageContentProps {
  repertoire: repertoireDetail;
  resolvedSongs: SongRef[];
}

export function RepertoirePageContent({ resolvedSongs}: RepertoirePageContentProps) {
  const { isPlaybackMode, exitPlaybackMode } = useRepertoirePlayback();

  if (!isPlaybackMode) {
    return null;
  }

  return (
    <section className="repertoire-playback-layout layout-h-margin">
      <RepertoirePlaybackSidebar repertoireSongs={resolvedSongs} />
      <div className="repertoire-playback-main">
        <div className="repertoire-playback-header">
          <div className="repertoire-playback-controls">
            <button
              type="button"
              className="repertoire-playback-close-btn"
              onClick={exitPlaybackMode}
            >
              <span className="material-symbols-outlined">close</span>
              Cerrar modo
            </button>
          </div>
        </div>
        <RepertoireSongViewer />
      </div>
    </section>
  );
}

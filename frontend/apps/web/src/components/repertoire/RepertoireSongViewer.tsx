'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudio } from '../../context/AudioContext';
import { SheetRenderer } from '../song/SheetRenderer';
import { getSongDetailById } from '../../features/song/repository';
import type { SongDetail, SongVersion } from '../../types/song';

type RepertoireInstrumentationOption = {
  id: string;
  name: string;
  lyrics?: string;
  sheetFileUrl?: string;
  audioReferenceUrl?: string;
};

function resolveSelectedInstrumentId(
  song: Pick<SongDetail, 'currentInstrumentId' | 'instruments'>,
  version?: Pick<SongVersion, 'instrumentId'> | null
): string {
  const versionInstrumentId = typeof version?.instrumentId === 'string' ? version.instrumentId.trim() : '';
  if (versionInstrumentId && song.instruments.some((instrument) => instrument.id === versionInstrumentId)) {
    return versionInstrumentId;
  }

  const currentInstrumentId = typeof song.currentInstrumentId === 'string' ? song.currentInstrumentId.trim() : '';
  if (currentInstrumentId && song.instruments.some((instrument) => instrument.id === currentInstrumentId)) {
    return currentInstrumentId;
  }

  return song.instruments[0]?.id ?? '';
}

function getInstrumentationOptions(song: SongDetail, version?: SongVersion | null): RepertoireInstrumentationOption[] {
  const nestedInstrumentations = Array.isArray(version?.instrumentations) ? version.instrumentations : [];

  if (nestedInstrumentations.length > 0) {
    return nestedInstrumentations.map((instrumentation) => ({
      id: typeof instrumentation.instrumentationId === 'string' && instrumentation.instrumentationId.trim().length > 0
        ? instrumentation.instrumentationId.trim()
        : instrumentation.id,
      name: instrumentation.instrumentName || instrumentation.instrumentationId || instrumentation.id || 'Instrumento',
      lyrics: typeof instrumentation.lyrics === 'string' ? instrumentation.lyrics : undefined,
      sheetFileUrl: typeof instrumentation.sheetFileUrl === 'string' ? instrumentation.sheetFileUrl : undefined,
      audioReferenceUrl: typeof instrumentation.audioReferenceUrl === 'string' ? instrumentation.audioReferenceUrl : undefined
    }));
  }

  return song.instruments.map((instrument) => ({
    id: instrument.id,
    name: instrument.name
  }));
}

function getSelectedInstrumentationOption(
  song: SongDetail,
  version?: SongVersion | null,
  selectedInstrumentId?: string
): RepertoireInstrumentationOption | undefined {
  const options = getInstrumentationOptions(song, version);
  const selectedId = typeof selectedInstrumentId === 'string' ? selectedInstrumentId.trim() : '';

  if (selectedId) {
    const selected = options.find((instrument) => instrument.id === selectedId);
    if (selected) {
      return selected;
    }
  }

  return options[0];
}

interface RepertoireSongViewerProps {
  songId?: string;
  versionId?: string;
}

export function RepertoireSongViewer({ songId: initialSongId, versionId: initialVersionId }: RepertoireSongViewerProps) {
  const { activeSong, playSong } = useAudio();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(initialVersionId);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | undefined>(undefined);
  const [sheetRenderError, setSheetRenderError] = useState('');
  const lyricsRef = useRef<HTMLDivElement>(null);

  // Use activeSong from audio context if available, otherwise use props
  const currentSongId = activeSong?.id || initialSongId;
  const currentVersionId = activeSong?.versionId || initialVersionId;

  // Fetch song details when songId changes
  useEffect(() => {
    if (!currentSongId) {
      setSong(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void getSongDetailById(currentSongId, currentVersionId).then((detail) => {
      setSong(detail ?? null);
      if (detail) {
        setSelectedVersionId(currentVersionId || detail.currentVersionId);
        const initialVersion = detail.versions.find((version) => version.id === (currentVersionId || detail.currentVersionId)) ?? detail.versions[0];
        const options = getInstrumentationOptions(detail, initialVersion);
        const requestedInstrumentId = typeof detail.currentInstrumentId === 'string' ? detail.currentInstrumentId.trim() : '';
        const nextInstrumentId = options.some((instrument) => instrument.id === requestedInstrumentId)
          ? requestedInstrumentId
          : (options[0]?.id ?? resolveSelectedInstrumentId(detail, initialVersion));
        setSelectedInstrumentId(nextInstrumentId);
      }
      setIsLoading(false);
    });
  }, [currentSongId, currentVersionId]);

  // Sync with audio context when active song changes
  useEffect(() => {
    if (activeSong?.versionId) {
      setSelectedVersionId(activeSong.versionId);
    }
  }, [activeSong?.versionId]);

  const selectedVersion = useMemo(() => {
    if (!song) return null;
    const selected = song.versions.find((version) => version.id === selectedVersionId);
    return selected ?? song.versions[0];
  }, [song, selectedVersionId]);

  const instrumentationOptions = useMemo(() => {
    if (!song) return [];
    return getInstrumentationOptions(song, selectedVersion);
  }, [song, selectedVersion]);

  const selectedInstrument = useMemo(() => {
    if (!song) return null;
    return getSelectedInstrumentationOption(song, selectedVersion, selectedInstrumentId) ?? null;
  }, [song, selectedInstrumentId, selectedVersion]);

  useEffect(() => {
    if (!song || !selectedVersion) {
      return;
    }

    const current = typeof selectedInstrumentId === 'string' ? selectedInstrumentId.trim() : '';
    const nextInstrumentId = instrumentationOptions.some((instrument) => instrument.id === current)
      ? current
      : (instrumentationOptions[0]?.id
          ?? resolveSelectedInstrumentId(song, selectedVersion)
          ?? '');

    if (nextInstrumentId && nextInstrumentId !== current) {
      setSelectedInstrumentId(nextInstrumentId);
    }
  }, [instrumentationOptions, selectedInstrumentId, selectedVersion, song]);

  const activeLyrics = useMemo(() => {
    if (typeof selectedVersion?.lyrics === 'string' && selectedVersion.lyrics.trim().length > 0) {
      return selectedVersion.lyrics;
    }
    if (typeof selectedInstrument?.lyrics === 'string' && selectedInstrument.lyrics.trim().length > 0) {
      return selectedInstrument.lyrics;
    }
    return song?.lyrics ?? '';
  }, [selectedInstrument?.lyrics, selectedVersion?.lyrics, song?.lyrics]);

  const activeSheetUrl = useMemo(() => {
    const fromInstrumentation = typeof selectedInstrument?.sheetFileUrl === 'string' ? selectedInstrument.sheetFileUrl.trim() : '';
    if (fromInstrumentation.length > 0) {
      return fromInstrumentation;
    }

    const fromVersion = typeof selectedVersion?.sheetFileUrl === 'string' ? selectedVersion.sheetFileUrl.trim() : '';
    if (fromVersion.length > 0) {
      return fromVersion;
    }

    const legacySongSheet = typeof song?.sheet === 'string' ? song.sheet.trim() : '';
    return legacySongSheet;
  }, [selectedInstrument?.sheetFileUrl, selectedVersion?.sheetFileUrl, song?.sheet]);

  const handleVersionChange = (versionId: string) => {
    setSelectedVersionId(versionId);
    if (song) {
      const nextVersion = song.versions.find((version) => version.id === versionId) ?? song.versions[0];
      const options = getInstrumentationOptions(song, nextVersion);
      const nextInstrumentId = options[0]?.id ?? resolveSelectedInstrumentId(song, nextVersion);
      setSelectedInstrumentId(nextInstrumentId);
    }

    // Update audio context with new version
    if (song && activeSong?.id === song.id) {
      const version = song.versions.find((v) => v.id === versionId);
      const selectedInstrumentationAudio = song && version
        ? getInstrumentationOptions(song, version)[0]?.audioReferenceUrl
        : undefined;
      if (version) {
        playSong({
          id: song.id,
          title: song.title,
          artistName: version.artistName ?? song.artistName,
          coverUrl: version.coverImageUrl ?? song.coverImageUrl ?? song.images?.[0]?.url ?? '',
          audioUrl: selectedInstrumentationAudio ?? version.audioReferenceUrl ?? song.audioUrl ?? '',
          versionId: version.id
        });
      }
    }
  };

  const handleInstrumentChange = (instrumentId: string) => {
    setSelectedInstrumentId(instrumentId);
  };

  if (isLoading) {
    return (
      <div className="repertoire-song-viewer-loading">
        <p>Cargando canción...</p>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="repertoire-song-viewer-error">
        <p>Selecciona una canción del repertorio para comenzar</p>
      </div>
    );
  }

  return (
    <div className="repertoire-song-viewer">
      {/* Filters */}
      <div className="repertoire-song-viewer-filters">
        <div className="repertoire-song-filter-group">
          <label className="repertoire-song-filter-label" htmlFor="version-select">
            Versión
          </label>
          <select
            id="version-select"
            className="repertoire-song-filter-select"
            value={selectedVersionId}
            onChange={(e) => handleVersionChange(e.target.value)}
          >
            {song.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.versionName ?? version.label}
                {version.isPremium ? ' (Premium)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="repertoire-song-filter-group">
          <label className="repertoire-song-filter-label" htmlFor="instrument-select">
            Instrumentación
          </label>
          <select
            id="instrument-select"
            className="repertoire-song-filter-select"
            value={selectedInstrumentId}
            onChange={(e) => handleInstrumentChange(e.target.value)}
          >
            {instrumentationOptions.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Song Header */}
      <div className="repertoire-song-viewer-header">
        <Link href={`/songs/${song.id}`} className="repertoire-song-viewer-title-link">
          <h2 className="repertoire-song-viewer-title">{song.title}</h2>
        </Link>
        {song.artists && song.artists.length > 0 ? (
          <Link href={`/artists/${song.artists[0].id}`} className="repertoire-song-viewer-artist-link">
            <p className="repertoire-song-viewer-artist">{selectedVersion?.artistName ?? song.artistName}</p>
          </Link>
        ) : (
          <p className="repertoire-song-viewer-artist">{selectedVersion?.artistName ?? song.artistName}</p>
        )}
        <div className="repertoire-song-viewer-meta">
          <span className="repertoire-song-viewer-chip">
            <span className="material-symbols-outlined">difference</span>
            {selectedVersion?.versionName ?? selectedVersion?.label ?? 'Versión base'}
          </span>
          <span className="repertoire-song-viewer-chip">
            <span className="material-symbols-outlined">mic</span>
            {selectedInstrument?.name ?? 'Instrumentación base'}
          </span>
        </div>
      </div>

      {/* Sheet/Lyrics Content */}
      <div className="repertoire-song-viewer-content" ref={lyricsRef}>
        {activeSheetUrl ? (
          <SheetRenderer url={activeSheetUrl} onError={setSheetRenderError} />
        ) : (
          <pre className="repertoire-song-lyrics">{activeLyrics}</pre>
        )}

        {activeSheetUrl && sheetRenderError ? (
          <p className="repertoire-song-sheet-hint">
            <a href={activeSheetUrl} target="_blank" rel="noreferrer">
              Abrir archivo de partitura
            </a>
          </p>
        ) : null}

        {selectedVersion?.isPremium ? (
          <div className="repertoire-song-viewer-paywall">
            <div className="repertoire-song-viewer-paywall-content">
              <span className="material-symbols-outlined">lock</span>
              <p>Desbloquea Premium para ver la partitura completa</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

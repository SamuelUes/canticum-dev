'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer } from './AudioPlayer';
import { SheetRenderer } from './SheetRenderer';
import { getArtistProfileHref } from '../../features/artist/routing';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import {
  loadSongFavorite,
  loadSongUserPreferences,
  requestTrackSongListen,
  saveSongFavorite,
  saveSongUserPreferences
} from '../../features/song/clientPersistence';
import { requestUpdateSongStatus } from '../../features/song/repository';
import type { SongDetail, SongVersion } from '../../types/song';

type SongEditorialStatus = 'IN_REVIEW' | 'REJECTED' | 'APPROVED' | 'PUBLISHED';

const SONG_STATUS_OPTIONS: Array<{ value: SongEditorialStatus; label: string; helper: string }> = [
  { value: 'IN_REVIEW', label: 'En revisión', helper: 'Para auditoría editorial' },
  { value: 'REJECTED', label: 'Rechazada', helper: 'No cumple el corte' },
  { value: 'APPROVED', label: 'Aprobada', helper: 'Lista para publicación' },
  { value: 'PUBLISHED', label: 'Publicada', helper: 'Visible para todos' }
] as const;

const SONG_STATUS_LABELS: Record<SongEditorialStatus, string> = {
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazada',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada'
};

function isSongEditorialStatus(value: string): value is SongEditorialStatus {
  return value === 'IN_REVIEW' || value === 'REJECTED' || value === 'APPROVED' || value === 'PUBLISHED';
}

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

function resolveVersionInstrumentationId(
  version?: Pick<SongVersion, 'instrumentations'> | null,
  preferredId?: string
): string {
  const instrumentations = Array.isArray(version?.instrumentations) ? version?.instrumentations : [];
  if (instrumentations.length === 0) {
    return '';
  }

  const preferred = typeof preferredId === 'string' ? preferredId.trim() : '';
  if (preferred) {
    const preferredMatch = instrumentations.find((instrumentation) => {
      const instrumentationId = typeof instrumentation.instrumentationId === 'string'
        ? instrumentation.instrumentationId.trim()
        : typeof instrumentation.id === 'string'
          ? instrumentation.id.trim()
          : '';
      return instrumentationId === preferred;
    });

    if (preferredMatch) {
      return typeof preferredMatch.instrumentationId === 'string' && preferredMatch.instrumentationId.trim().length > 0
        ? preferredMatch.instrumentationId.trim()
        : preferredMatch.id;
    }
  }

  const firstInstrumentation = instrumentations[0];
  if (!firstInstrumentation) {
    return '';
  }

  return typeof firstInstrumentation.instrumentationId === 'string' && firstInstrumentation.instrumentationId.trim().length > 0
    ? firstInstrumentation.instrumentationId.trim()
    : firstInstrumentation.id;
}

type SongWorkspaceInstrumentationOption = {
  id: string;
  name: string;
  lyrics?: string;
  sheetFileUrl?: string;
};

function getInstrumentationOptions(song: SongDetail, version?: SongVersion | null): SongWorkspaceInstrumentationOption[] {
  const nestedInstrumentations = Array.isArray(version?.instrumentations) ? version.instrumentations : [];

  if (nestedInstrumentations.length > 0) {
    return nestedInstrumentations.map((instrumentation) => ({
      id: typeof instrumentation.instrumentationId === 'string' && instrumentation.instrumentationId.trim().length > 0
        ? instrumentation.instrumentationId.trim()
        : instrumentation.id,
      name: instrumentation.instrumentName || instrumentation.instrumentationId || instrumentation.id || 'Instrumento',
      lyrics: typeof instrumentation.lyrics === 'string' ? instrumentation.lyrics : undefined,
      sheetFileUrl: typeof instrumentation.sheetFileUrl === 'string' ? instrumentation.sheetFileUrl : undefined
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
): SongWorkspaceInstrumentationOption | undefined {
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

interface SongWorkspaceProps {
  song: SongDetail;
  initialVersionId?: string;
}

export function SongWorkspace({ song, initialVersionId }: SongWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { playSong: playGlobalSong } = useAudio();
  const { openPremiumPlans } = usePremiumNavigation();

  const persistentTools = [
    { label: 'Agregar a la lista', icon: 'bookmark', requiresPremium: false },
    { label: 'Metrónomo', icon: 'timer', requiresPremium: true },
    { label: 'Diccionario', icon: 'menu_book', requiresPremium: true },
    { label: 'Corregir', icon: 'edit', requiresPremium: true },
    { label: 'Imprimir', icon: 'print', requiresPremium: true },
    { label: 'Descargar', icon: 'download', requiresPremium: true }
  ];

  const [isFavorite, setIsFavorite] = useState(Boolean(song.isFavorite));
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [activeAudioSrc, setActiveAudioSrc] = useState<string | null>(null);
  const [audioAutoplayToken, setAudioAutoplayToken] = useState(0);
  const [selectedVersionId, setSelectedVersionId] = useState(() => {
    const requested = typeof initialVersionId === 'string' ? initialVersionId.trim() : '';
    if (requested && song.versions.some((version) => version.id === requested)) {
      return requested;
    }

    return song.currentVersionId;
  });
  const [selectedInstrumentIdState, setSelectedInstrumentId] = useState(() => {
    return resolveSelectedInstrumentId(song, song.versions.find((version) => version.id === song.currentVersionId) ?? song.versions[0]);
  });
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [songAccessMessage, setSongAccessMessage] = useState('');
  const [sheetRenderError, setSheetRenderError] = useState('');
  const [songStatusSelection, setSongStatusSelection] = useState<SongEditorialStatus>(() => {
    const raw = typeof song.status === 'string' ? song.status.trim().toUpperCase() : '';
    return isSongEditorialStatus(raw) ? raw : 'APPROVED';
  });
  const [isSongStatusMenuOpen, setIsSongStatusMenuOpen] = useState(false);
  const [isUpdatingSongStatus, setIsUpdatingSongStatus] = useState(false);

  const lyricsRef = useRef<HTMLDivElement>(null);
  const audioTriggerTimeoutRef = useRef<number | null>(null);
  const hasTrackedEntryRef = useRef(false);

  const userAccess = useMemo(() => {
    const isPremiumUser = Boolean(song.userAccess?.isPremiumUser) || Boolean(user?.isPremium);
    const isAuthenticated = Boolean(song.userAccess?.isAuthenticated) || Boolean(user);
    return {
      isAuthenticated,
      isPremiumUser,
      hasSongUnlock: Boolean(song.userAccess?.hasSongUnlock),
      canPurchaseIndividually: Boolean(song.userAccess?.canPurchaseIndividually),
      individualPriceUsd: song.userAccess?.individualPriceUsd
    };
  }, [song.userAccess, user]);

  const hasAdvancedAccess = userAccess.isPremiumUser || userAccess.hasSongUnlock;

  const isAdminUser = user?.role === 'admin';
  const selectedSongStatusLabel = SONG_STATUS_LABELS[songStatusSelection];

  const onAdminChangeSongStatus = async () => {
    if (!isAdminUser || isUpdatingSongStatus) {
      return;
    }

    setIsUpdatingSongStatus(true);
    const result = await requestUpdateSongStatus(song.id, songStatusSelection);
    setIsUpdatingSongStatus(false);

    if (!result.ok) {
      setSongAccessMessage('No se pudo actualizar el estado de la canción.');
      return;
    }

    setSongAccessMessage(`Estado actualizado a ${songStatusSelection}.`);
    router.refresh();
  };


  const selectedVersion = useMemo(() => {
    const selected = song.versions.find((version) => version.id === selectedVersionId);

    if (selected && (!selected.isPremium || hasAdvancedAccess)) {
      return selected;
    }

    const firstAllowed = song.versions.find((version) => !version.isPremium || hasAdvancedAccess);
    return firstAllowed ?? song.versions[0];
  }, [hasAdvancedAccess, selectedVersionId, song.versions]);

  const selectedInstrumentId = useMemo(() => {
    const options = getInstrumentationOptions(song, selectedVersion);
    if (options.length === 0) {
      return resolveSelectedInstrumentId(song, selectedVersion);
    }

    const found = options.find((instrument) => instrument.id === selectedInstrumentIdState);
    return found?.id ?? options[0]?.id ?? '';
  }, [selectedInstrumentIdState, selectedVersion, song]);

  const selectedInstrument = useMemo(() => {
    return getSelectedInstrumentationOption(song, selectedVersion, selectedInstrumentId);
  }, [selectedInstrumentId, selectedVersion, song]);

  const activeLyrics = useMemo(() => {
    if (typeof selectedVersion?.lyrics === 'string' && selectedVersion.lyrics.trim().length > 0) {
      return selectedVersion.lyrics;
    }
    if (typeof selectedInstrument?.lyrics === 'string' && selectedInstrument.lyrics.trim().length > 0) {
      return selectedInstrument.lyrics;
    }
    return song.lyrics;
  }, [selectedInstrument?.lyrics, selectedVersion?.lyrics, song.lyrics]);

  const activeSheetUrl = useMemo(() => {
    const fromInstrumentation = typeof selectedInstrument?.sheetFileUrl === 'string' ? selectedInstrument.sheetFileUrl.trim() : '';
    if (fromInstrumentation.length > 0) {
      return fromInstrumentation;
    }

    const fromVersion = typeof selectedVersion?.sheetFileUrl === 'string' ? selectedVersion.sheetFileUrl.trim() : '';
    if (fromVersion.length > 0) {
      return fromVersion;
    }

    const legacySongSheet = typeof song.sheet === 'string' ? song.sheet.trim() : '';
    return legacySongSheet;
  }, [selectedInstrument?.sheetFileUrl, selectedVersion?.sheetFileUrl, song.sheet]);

  const resolveCoverUrl = (value?: string | null) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : '');
  const coverImageUrl =
    resolveCoverUrl(selectedVersion?.coverImageUrl) ||
    resolveCoverUrl(song.coverImageUrl) ||
    resolveCoverUrl(song.images?.[0]?.url);

  useEffect(() => {
    let isMounted = true;

    void loadSongUserPreferences(song.id).then((preferences) => {
      if (!isMounted || !preferences) {
        return;
      }

      if (preferences.currentVersionId && song.versions.some((version) => version.id === preferences.currentVersionId)) {
        setSelectedVersionId(preferences.currentVersionId);
      }

      if (typeof preferences.currentInstrumentId === 'string' && preferences.currentInstrumentId.trim().length > 0) {
        setSelectedInstrumentId(preferences.currentInstrumentId.trim());
      }
    });

    return () => {
      isMounted = false;
    };
  }, [song.id, song.instruments, song.versions]);

  useEffect(() => {
    const requested = typeof initialVersionId === 'string' ? initialVersionId.trim() : '';
    if (requested && song.versions.some((version) => version.id === requested)) {
      setSelectedVersionId(requested);
      return;
    }

    setSelectedVersionId(song.currentVersionId);
  }, [initialVersionId, song.currentVersionId, song.versions]);

  useEffect(() => {
    const options = getInstrumentationOptions(song, selectedVersion);
    if (options.length === 0) {
      return;
    }

    const current = selectedInstrumentIdState.trim();
    const nextInstrumentId = options.some((instrument) => instrument.id === current)
      ? current
      : options[0].id;

    if (nextInstrumentId !== current) {
      setSelectedInstrumentId(nextInstrumentId);
    }
  }, [selectedInstrumentIdState, selectedVersion, song]);

  useEffect(() => {
    let isMounted = true;

    void loadSongFavorite(song.id, selectedVersionId).then((favorite) => {
      if (!isMounted || typeof favorite !== 'boolean') {
        return;
      }

      setIsFavorite(favorite);
    });

    return () => {
      isMounted = false;
    };
  }, [song.id, selectedVersionId]);

  useEffect(() => {
    if (!isAutoScrolling) {
      return;
    }

    const target = lyricsRef.current;
    if (!target) {
      return;
    }

    // Calculate scroll speed based on audio duration if available
    // Default to 1 if no audio or duration is unknown
    const calculatedSpeed = audioDuration && audioDuration > 0 
      ? Math.max(1, Math.floor(target.scrollHeight / (audioDuration * 60))) // Approximate pixels per second
      : 1;

    const interval = window.setInterval(() => {
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      if (target.scrollTop >= maxScrollTop - 1) {
        setIsAutoScrolling(false);
        return;
      }

      target.scrollTop += calculatedSpeed;
    }, 38);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAutoScrolling, audioDuration]);

  useEffect(() => {
    return () => {
      if (audioTriggerTimeoutRef.current !== null) {
        window.clearTimeout(audioTriggerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasTrackedEntryRef.current) {
      return;
    }
    hasTrackedEntryRef.current = true;
    void requestTrackSongListen(song.id);
  }, [song.id]);

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const expectedVersionId = selectedVersion?.id ?? selectedVersionId;
    const expectedInstrumentId = selectedInstrumentId;
    const currentVersionParam = searchParams?.get('versionId') ?? '';
    const currentInstrumentParam = searchParams?.get('instrumentId') ?? '';

    if (currentVersionParam === expectedVersionId && currentInstrumentParam === expectedInstrumentId) {
      return;
    }

    const params = new URLSearchParams(searchParams?.toString());
    if (expectedVersionId) {
      params.set('versionId', expectedVersionId);
    } else {
      params.delete('versionId');
    }

    if (expectedInstrumentId) {
      params.set('instrumentId', expectedInstrumentId);
    } else {
      params.delete('instrumentId');
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, selectedInstrumentId, selectedVersion?.id, selectedVersionId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        setSongAccessMessage(detail.message);
      }
    };
    window.addEventListener('canticum:plan_limit', handler);
    return () => window.removeEventListener('canticum:plan_limit', handler);
  }, []);

  const triggerAudioFeedback = () => {
    if (audioTriggerTimeoutRef.current !== null) {
      window.clearTimeout(audioTriggerTimeoutRef.current);
    }

    audioTriggerTimeoutRef.current = window.setTimeout(() => {
      audioTriggerTimeoutRef.current = null;
    }, 420);
  };

  const onPlayReferenceAudio = () => {
    if (selectedVersion?.isPremium && !hasAdvancedAccess) {
      setSongAccessMessage('Esta versión requiere Premium o compra individual de la canción.');
      return;
    }

    const audioSource = selectedVersion?.audioReferenceUrl ?? song.audioUrl;

    if (!audioSource) {
      return;
    }

    // Close player if already open
    if (activeAudioSrc) {
      setActiveAudioSrc(null);
      setIsAudioPlaying(false);
      return;
    }

    // Open the player
    setActiveAudioSrc(audioSource);
    setAudioAutoplayToken((prev) => prev + 1);
    setSongAccessMessage('');
    triggerAudioFeedback();

    // Sync with global audio context for floating player
    const coverImageUrl = resolveCoverUrl(selectedVersion?.coverImageUrl) ||
      resolveCoverUrl(song.coverImageUrl) ||
      resolveCoverUrl(song.images?.[0]?.url);

    playGlobalSong({
      id: song.id,
      title: song.title,
      artistName: selectedVersion?.artistName ?? song.artistName,
      coverUrl: coverImageUrl,
      audioUrl: audioSource,
      versionId: selectedVersionId
    });
  };

  const onToggleFavorite = () => {
    setIsFavorite((previousValue) => {
      const nextValue = !previousValue;
      void saveSongFavorite(song.id, selectedVersionId, nextValue);
      void saveSongUserPreferences(song.id, {
        currentVersionId: selectedVersionId,
        currentInstrumentId: selectedInstrumentId
      });
      return nextValue;
    });
  };

  const onSelectVersion = (versionId: string) => {
    const version = song.versions.find((item) => item.id === versionId);
    if (version?.isPremium && !hasAdvancedAccess) {
      setSongAccessMessage('Desbloquea Premium o compra esta canción para usar esta versión.');
      return;
    }

    // Stop audio when changing version
    if (activeAudioSrc) {
      setActiveAudioSrc(null);
      setIsAudioPlaying(false);
    }

    setSelectedVersionId(versionId);
    setSongAccessMessage('');
    const nextInstrumentId = resolveVersionInstrumentationId(version, selectedInstrumentIdState);
    if (nextInstrumentId) {
      setSelectedInstrumentId(nextInstrumentId);
    }
    void saveSongUserPreferences(song.id, {
      currentVersionId: versionId,
      currentInstrumentId: nextInstrumentId
    });
  };

  const onSelectInstrument = (instrumentId: string) => {
    const options = getInstrumentationOptions(song, selectedVersion);
    const exists = options.some((instrument) => instrument.id === instrumentId);
    if (!exists) {
      setSongAccessMessage('No existe una instrumentación disponible para esta versión.');
      return;
    }

    setSelectedInstrumentId(instrumentId);
    setSongAccessMessage('');
    void saveSongUserPreferences(song.id, {
      currentVersionId: selectedVersionId,
      currentInstrumentId: instrumentId
    });
  };


  return (
    <section className="song-page">
      <aside className="song-sidebar ">
        {/* Filters Card */}
        <div className="song-sidebar-card song-filters-card">
          <h3 className="song-sidebar-title">Filtros</h3>
          
          <div className="song-filter-group">
            <label className="song-filter-label" htmlFor="version-select">Versión</label>
            <select
              id="version-select"
              className="song-filter-select"
              value={selectedVersionId}
              onChange={(e) => onSelectVersion(e.target.value)}
            >
              {song.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.versionName ?? version.label}
                  {version.isPremium && !hasAdvancedAccess ? ' (Premium)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="song-filter-group">
            <label className="song-filter-label" htmlFor="instrument-select">Instrumentación</label>
            <select
              id="instrument-select"
              className="song-filter-select"
              value={selectedInstrumentId}
              onChange={(e) => onSelectInstrument(e.target.value)}
              title="Selecciona una instrumentación para saltar a su versión correspondiente"
            >
              {getInstrumentationOptions(song, selectedVersion).map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions Card */}
        <div className="song-sidebar-card song-actions-card">
          <ul className="song-actions-list">
            {persistentTools.map((tool) => {
              const isLocked = tool.requiresPremium && !hasAdvancedAccess;
              return (
                <li key={tool.label}>
                  <button
                    type="button"
                    className="song-action-button"
                    aria-disabled={isLocked}
                    title={isLocked ? 'Disponible en Premium o compra individual' : tool.label}
                    onClick={isLocked ? () => { openPremiumPlans(); } : undefined}
                  >
                    <div className="song-action-content">
                      <span className="material-symbols-outlined song-action-icon">{tool.icon}</span>
                      <span>{tool.label}</span>
                    </div>
                    {isLocked && <span className="material-symbols-outlined song-action-lock">lock</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <article className="song-main-content">
        <header className="song-header layout-h-margin">
          <div className="song-header-top">
            <div className="song-cover-wrapper">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt={`Portada de ${song.title}`}
                  fill
                  sizes="(max-width: 768px) 220px, 184px"
                  className="song-cover-image"
                  priority
                />
              ) : (
                <div className="song-cover-placeholder">
                  <span>Aquí el cover</span>
                </div>
              )}
            </div>

            <div className="song-header-info">
              <div className="song-header-title-row">
                <div className="song-title-section">
                  <h1 className="song-title">{song.title}</h1>
                  <Link
                    className="song-artist-link"
                    href={getArtistProfileHref({
                      artistId: selectedVersion?.artistId ?? song.artists?.[0]?.id,
                      artistName: selectedVersion?.artistName ?? song.artistName
                    })}
                  >
                    {selectedVersion?.artistName ?? song.artistName}
                  </Link>
                </div>

                <div className="song-header-badges">
                  {selectedVersion?.isPremium && !hasAdvancedAccess ? (
                    <span className="song-premium-badge">
                      <span className="material-symbols-outlined song-premium-icon">workspace_premium</span>
                      PREMIUM
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="song-version-chips">
                <div className="song-chip">
                  <span className="material-symbols-outlined song-chip-icon">difference</span>
                  {selectedVersion?.versionName ?? selectedVersion?.label ?? 'Versión base'}
                </div>
                <div className="song-chip">
                  <span className="material-symbols-outlined song-chip-icon">mic</span>
                  {selectedInstrument?.name ?? 'Instrumento base'}
                </div>
              </div>

              <div className="song-header-actions">
                <div className="song-audio-mini-player">
                  <button
                    type="button"
                    className="song-play-button"
                    onClick={onPlayReferenceAudio}
                    aria-label={isAudioPlaying ? 'Pausar audio' : 'Reproducir audio'}
                  >
                    <span className="song-play-audio-button">{isAudioPlaying ? 'Cerrar' : 'Reproducir'}</span>
                  </button>
                  
                  {activeAudioSrc ? (
                    <div className="song-inline-audio-player">
                      <AudioPlayer
                        key={`${activeAudioSrc}-${audioAutoplayToken}`}
                        src={activeAudioSrc}
                        title={song.title}
                        songId={song.id}
                        artistName={selectedVersion?.artistName ?? song.artistName}
                        coverUrl={coverImageUrl}
                        autoPlay
                        onPlayingChange={setIsAudioPlaying}
                        onDurationChange={setAudioDuration}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="song-secondary-actions">
                  <button
                    type="button"
                    className={isAutoScrolling ? 'song-secondary-button is-active' : 'song-secondary-button'} 
                    onClick={() => { setIsAutoScrolling((prev) => !prev); onPlayReferenceAudio(); }}
                  >
                    <span className="material-symbols-outlined">swap_vert</span>
                    Desplazar
                  </button>
                  <button
                    type="button"
                    className={isFavorite ? 'song-favorite-button is-active' : 'song-favorite-button'}
                    aria-label="Marcar favorito"
                    aria-pressed={isFavorite}
                    onClick={onToggleFavorite}
                  >
                    <span className="material-symbols-outlined">favorite</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Status Tools */}
          {isAdminUser ? (
            <div className="song-admin-status-tools" aria-label="Controles de moderación">
              <div className="song-admin-status-header">
                <div className="song-admin-status-title">
                  <span className="material-symbols-outlined song-admin-status-icon">admin_panel_settings</span>
                  <div>
                    <span className="song-admin-status-kicker">Moderación editorial</span>
                    <h3>Cambiar estado</h3>
                  </div>
                </div>
                <span className={`song-admin-status-badge status-${songStatusSelection.toLowerCase()}`}>
                  {selectedSongStatusLabel}
                </span>
              </div>

              <div className="song-admin-status-combobox" data-open={isSongStatusMenuOpen ? 'true' : 'false'}>
                <button
                  type="button"
                  className="song-admin-status-combobox-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={isSongStatusMenuOpen}
                  aria-label="Seleccionar estado de la canción"
                  onClick={() => setIsSongStatusMenuOpen((prev) => !prev)}
                >
                  <span className="song-admin-status-combobox-label">Estado actual</span>
                  <span className="song-admin-status-combobox-value">{selectedSongStatusLabel}</span>
                  <span className="material-symbols-outlined song-admin-status-combobox-chevron" aria-hidden>
                    {isSongStatusMenuOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {isSongStatusMenuOpen ? (
                  <div className="song-admin-status-combobox-menu" role="listbox" aria-label="Opciones de estado">
                    {SONG_STATUS_OPTIONS.map((option) => {
                      const isActive = songStatusSelection === option.value;
                      const statusIcon = {
                        in_review: 'pending',
                        rejected: 'cancel',
                        approved: 'check_circle',
                        published: 'public'
                      }[option.value.toLowerCase()] || 'circle';
                      
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`song-admin-status-combobox-option status-${option.value.toLowerCase()} ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            setSongStatusSelection(option.value);
                            setIsSongStatusMenuOpen(false);
                          }}
                        >
                          <div className="song-admin-status-option-content">
                            <div className="song-admin-status-option-left">
                              <span className="material-symbols-outlined song-admin-status-option-icon">{statusIcon}</span>
                              <div className="song-admin-status-option-text">
                                <strong>{option.label}</strong>
                                <span className="song-admin-status-option-helper">{option.helper}</span>
                              </div>
                            </div>
                            {isActive ? <span className="song-admin-status-current-badge">Actual</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="song-admin-status-actions">
                <button type="button" className="song-admin-status-action" onClick={onAdminChangeSongStatus} disabled={isUpdatingSongStatus}>
                  {isUpdatingSongStatus ? (
                    <span className="song-admin-status-action-content">
                      <span className="material-symbols-outlined song-admin-status-action-icon is-loading">refresh</span>
                      Actualizando...
                    </span>
                  ) : (
                    <span className="song-admin-status-action-content">
                      <span className="material-symbols-outlined song-admin-status-action-icon">check</span>
                      Aplicar estado
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </header>

        {/* Premium Banner */}
        {!hasAdvancedAccess && selectedVersion?.isPremium ? (
          <div className="song-premium-banner">
            <div className="song-premium-banner-content">
              <span className="material-symbols-outlined song-premium-banner-icon">workspace_premium</span>
              <div>
                <h4 className="song-premium-banner-title">Acceso Premium Requerido</h4>
                <p className="song-premium-banner-text">La versión &quot;{selectedVersion?.versionName ?? selectedVersion?.label}&quot; completa está disponible para suscriptores.</p>
              </div>
            </div>
            <button
              type="button"
              className="song-premium-banner-cta"
              onClick={openPremiumPlans}
            >
              Mejorar Plan
            </button>
          </div>
        ) : null}

        {songAccessMessage ? <p className="song-access-message">{songAccessMessage}</p> : null}

        {/* Lyrics/Sheet Workspace */}
        <div className="song-workspace layout-h-margin">
          {/* <div className="song-workspace-toolbar">
            <div className="song-workspace-toolbar-left">
              <button
                type="button"
                className="song-workspace-tool-button"
                aria-label="Acercar"
              >
                <span className="material-symbols-outlined">zoom_in</span>
                Acercar
              </button>
              <button
                type="button"
                className="song-workspace-tool-button"
                aria-label="Alejar"
              >
                <span className="material-symbols-outlined">zoom_out</span>
                Alejar
              </button>
            </div>
            <div className="song-workspace-toolbar-right">
              <span className="song-workspace-mode-badge">MODO TEXTO</span>
            </div>
          </div> */}

          <div className="song-workspace-content" ref={lyricsRef}>
            {activeSheetUrl ? (
              <SheetRenderer url={activeSheetUrl} onError={setSheetRenderError} />
            ) : (
              <pre className="song-lyrics">{activeLyrics}</pre>
            )}

            {activeSheetUrl && sheetRenderError ? (
              <p className="song-sheet-hint">
                <a href={activeSheetUrl} target="_blank" rel="noreferrer">Abrir archivo de partitura</a>
              </p>
            ) : null}

            {/* Paywall Overlay */}
            {!hasAdvancedAccess && selectedVersion?.isPremium ? (
              <div className="song-workspace-paywall">
                <div className="song-workspace-paywall-content">
                  <span className="material-symbols-outlined song-workspace-paywall-icon">lock</span>
                  Desbloquea para ver la partitura completa
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </section>
  );
}

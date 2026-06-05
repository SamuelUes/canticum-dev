'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer } from './AudioPlayer';
import { getArtistProfileHref } from '../../features/artist/routing';
import { useAuth } from '../../context/AuthContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import {
  loadSongFavorite,
  loadSongUserPreferences,
  requestTrackSongListen,
  saveSongFavorite,
  saveSongUserPreferences
} from '../../features/song/clientPersistence';
import { requestUpdateSongStatus } from '../../features/song/repository';
import type { SongDetail } from '../../types/song';

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


function getSheetFileExtension(url: string): string {
  if (!url) {
    return '';
  }

  const cleaned = url.split('?')[0]?.split('#')[0] ?? '';
  const dot = cleaned.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }

  return cleaned.slice(dot + 1).toLowerCase();
}

function isMusicXmlSheet(url: string): boolean {
  const extension = getSheetFileExtension(url);
  return extension === 'xml' || extension === 'musicxml' || extension === 'mxl';
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
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(song.currentInstrumentId);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const scrollSpeed = 1;
  const [songAccessMessage, setSongAccessMessage] = useState('');
  const [isRenderingSheet, setIsRenderingSheet] = useState(false);
  const [sheetRenderError, setSheetRenderError] = useState('');
  const [songStatusSelection, setSongStatusSelection] = useState<SongEditorialStatus>(() => {
    const raw = typeof song.status === 'string' ? song.status.trim().toUpperCase() : '';
    return isSongEditorialStatus(raw) ? raw : 'APPROVED';
  });
  const [isSongStatusMenuOpen, setIsSongStatusMenuOpen] = useState(false);
  const [isUpdatingSongStatus, setIsUpdatingSongStatus] = useState(false);

  const lyricsRef = useRef<HTMLDivElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);
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

  const selectedInstrument = useMemo(() => {
    return song.instruments.find((instrument) => instrument.id === selectedInstrumentId) ?? song.instruments[0];
  }, [selectedInstrumentId, song.instruments]);

  const activeLyrics = useMemo(() => {
    if (typeof selectedVersion?.lyrics === 'string' && selectedVersion.lyrics.trim().length > 0) {
      return selectedVersion.lyrics;
    }
    return song.lyrics;
  }, [selectedVersion?.lyrics, song.lyrics]);

  const activeSheetUrl = useMemo(() => {
    const fromVersion = typeof selectedVersion?.sheetFileUrl === 'string' ? selectedVersion.sheetFileUrl.trim() : '';
    if (fromVersion.length > 0) {
      return fromVersion;
    }

    const legacySongSheet = typeof song.sheet === 'string' ? song.sheet.trim() : '';
    return legacySongSheet;
  }, [selectedVersion?.sheetFileUrl, song.sheet]);

  const shouldRenderMusicXmlSheet = useMemo(() => isMusicXmlSheet(activeSheetUrl), [activeSheetUrl]);

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

      if (preferences.currentInstrumentId && song.instruments.some((instrument) => instrument.id === preferences.currentInstrumentId)) {
        setSelectedInstrumentId(preferences.currentInstrumentId);
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

    const interval = window.setInterval(() => {
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      if (target.scrollTop >= maxScrollTop - 1) {
        setIsAutoScrolling(false);
        return;
      }

      target.scrollTop += scrollSpeed;
    }, 38);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAutoScrolling, scrollSpeed]);

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
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        setSongAccessMessage(detail.message);
      }
    };
    window.addEventListener('canticum:plan_limit', handler);
    return () => window.removeEventListener('canticum:plan_limit', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!shouldRenderMusicXmlSheet || !activeSheetUrl) {
      setIsRenderingSheet(false);
      setSheetRenderError('');
      if (sheetContainerRef.current) {
        sheetContainerRef.current.innerHTML = '';
      }
      return;
    }

    const container = sheetContainerRef.current;
    if (!container) {
      return;
    }

    setIsRenderingSheet(true);
    setSheetRenderError('');
    container.innerHTML = '';

    void (async () => {
      try {
        const response = await fetch(activeSheetUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('No se pudo cargar la partitura.');
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        const extension = getSheetFileExtension(activeSheetUrl);
        const arrayBuffer = await response.arrayBuffer();
        const isMxl = extension === 'mxl'
          || contentType.includes('zip')
          || contentType.includes('compressed');
        const source: string | Uint8Array = isMxl
          ? new Uint8Array(arrayBuffer)
          : new TextDecoder().decode(arrayBuffer);

        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          drawTitle: false,
          drawingParameters: 'compact'
        });

        await osmd.load(source);
        osmd.render();

        if (cancelled) {
          return;
        }
      } catch {
        if (!cancelled) {
          setSheetRenderError('No se pudo renderizar la partitura automáticamente.');
        }
      } finally {
        if (!cancelled) {
          setIsRenderingSheet(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [activeSheetUrl, shouldRenderMusicXmlSheet]);

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

    if (activeAudioSrc === audioSource && isAudioPlaying) {
      setActiveAudioSrc(null);
      setIsAudioPlaying(false);
      return;
    }

    setActiveAudioSrc(audioSource);
    setAudioAutoplayToken((prev) => prev + 1);
    setSongAccessMessage('');
    triggerAudioFeedback();
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

    setSelectedVersionId(versionId);
    setSongAccessMessage('');
    void saveSongUserPreferences(song.id, {
      currentVersionId: versionId,
      currentInstrumentId: selectedInstrumentId
    });

    if (pathname) {
      const currentVersionParam = searchParams?.get('versionId') ?? '';
      if (currentVersionParam !== versionId) {
        const params = new URLSearchParams(searchParams?.toString());
        params.set('versionId', versionId);
        const query = params.toString();
        router.replace(`${pathname}?${query}`, { scroll: false });
      }
    }
  };

  const onSelectInstrument = (instrumentId: string) => {
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
            >
              {song.instruments.map((instrument) => (
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
                    <span className="material-symbols-outlined">{isAudioPlaying ? 'pause_circle' : 'play_circle'}</span>
                  </button>
                  
                  {activeAudioSrc ? (
                    <div className="song-inline-audio-player">
                      <AudioPlayer
                        key={`${activeAudioSrc}-${audioAutoplayToken}`}
                        src={activeAudioSrc}
                        title={song.title}
                        autoPlay
                        showMainButton={false}
                        onEnded={() => setIsAudioPlaying(false)}
                        onPlayingChange={setIsAudioPlaying}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="song-secondary-actions">
                  <button
                    type="button"
                    className={isAutoScrolling ? 'song-secondary-button is-active' : 'song-secondary-button'} 
                    onClick={() => setIsAutoScrolling((prev) => !prev)}
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
          <div className="song-workspace-toolbar">
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
          </div>

          <div className="song-workspace-content" ref={lyricsRef}>
            {shouldRenderMusicXmlSheet ? (
              <div className="song-sheet-renderer" aria-live="polite">
                {isRenderingSheet ? <p className="song-sheet-status">Cargando partitura…</p> : null}
                <div className="song-sheet-canvas" ref={sheetContainerRef} aria-label="Partitura renderizada" />
                {sheetRenderError ? <p className="song-sheet-error">{sheetRenderError}</p> : null}
              </div>
            ) : (
              <pre className="song-lyrics">{activeLyrics}</pre>
            )}

            {activeSheetUrl ? (
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

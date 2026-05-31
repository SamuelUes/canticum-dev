'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer } from './AudioPlayer';
import { getArtistProfileHref } from '../../features/artist/routing';
import { useAuth } from '../../context/AuthContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import {
  loadSongFavorite,
  loadSongUserPreferences,
  requestSongPurchaseIntent,
  requestTrackSongListen,
  saveSongFavorite,
  saveSongUserPreferences
} from '../../features/song/clientPersistence';
import type { SongDetail } from '../../types/song';

type SidePanelMode = 'versions' | 'instruments' | null;
type ScrollSpeed = 1 | 1.5 | 2;

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
  const { requireAuth } = useRequireAuth();

  const persistentTools = [
    { label: 'Agregar a la lista', requiresPremium: false },
    { label: 'Metrónomo', requiresPremium: true },
    { label: 'Diccionario', requiresPremium: true },
    { label: 'Corregir', requiresPremium: true },
    { label: 'Imprimir', requiresPremium: true },
    { label: 'Descargar', requiresPremium: true }
  ];
  const scrollSpeedOptions: ScrollSpeed[] = [1, 1.5, 2];

  const [isFavorite, setIsFavorite] = useState(Boolean(song.isFavorite));
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioTriggering, setIsAudioTriggering] = useState(false);
  const [activeAudioSrc, setActiveAudioSrc] = useState<string | null>(null);
  const [audioAutoplayToken, setAudioAutoplayToken] = useState(0);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>(null);
  const [selectedVersionId, setSelectedVersionId] = useState(() => {
    const requested = typeof initialVersionId === 'string' ? initialVersionId.trim() : '';
    if (requested && song.versions.some((version) => version.id === requested)) {
      return requested;
    }

    return song.currentVersionId;
  });
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(song.currentInstrumentId);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<ScrollSpeed>(1);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [songAccessMessage, setSongAccessMessage] = useState('');
  const [isRenderingSheet, setIsRenderingSheet] = useState(false);
  const [sheetRenderError, setSheetRenderError] = useState('');

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

    setIsAudioTriggering(true);
    audioTriggerTimeoutRef.current = window.setTimeout(() => {
      setIsAudioTriggering(false);
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

  const onStartSongPurchase = async () => {
    if (!requireAuth('purchase')) {
      return;
    }

    setIsProcessingPurchase(true);
    const result = await requestSongPurchaseIntent(song.id);
    setIsProcessingPurchase(false);

    if (result?.checkoutUrl) {
      window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setSongAccessMessage('No se pudo iniciar la compra ahora. Inténtalo nuevamente en unos minutos.');
  };

  return (
    <section className="song-page-content layout-h-margin">
      <aside className="song-left-rail">
        <div className="song-page-controls">
          <button
            type="button"
            className={sidePanelMode === 'versions' ? 'song-filter-button is-active' : 'song-filter-button'}
            onClick={() => setSidePanelMode((prev) => (prev === 'versions' ? null : 'versions'))}
          >
            Versión
          </button>
          <button
            type="button"
            className={sidePanelMode === 'instruments' ? 'song-filter-button is-active' : 'song-filter-button'}
            onClick={() => setSidePanelMode((prev) => (prev === 'instruments' ? null : 'instruments'))}
          >
            Instrumentación
          </button>
        </div>

        {sidePanelMode ? (
          <>
            <button type="button" className="song-drawer-backdrop" aria-label="Cerrar selector" onClick={() => setSidePanelMode(null)} />
            <aside className="song-side-panel song-side-panel-left" aria-label="selector lateral izquierdo">
              <div className="song-side-panel-head">
                <h3>{sidePanelMode === 'versions' ? 'Selecciona versión' : 'Selecciona instrumento'}</h3>
                <button type="button" className="song-close-panel" onClick={() => setSidePanelMode(null)}>
                  ✕
                </button>
              </div>

              <div className="song-side-panel-list">
                {sidePanelMode === 'versions'
                  ? song.versions.map((version) => {
                      const isActive = version.id === selectedVersionId;
                      return (
                        <button
                          key={version.id}
                          type="button"
                          className={isActive ? 'song-side-item is-active' : version.isPremium && !hasAdvancedAccess ? 'song-side-item is-locked' : 'song-side-item'}
                          onClick={() => onSelectVersion(version.id)}
                        >
                          <strong>{version.versionName ?? version.label}</strong>
                          <small>{version.isPremium && !hasAdvancedAccess ? 'Premium / Compra individual' : version.artistName}</small>
                        </button>
                      );
                    })
                  : song.instruments.map((instrument) => {
                      const isActive = instrument.id === selectedInstrumentId;
                      return (
                        <button
                          key={instrument.id}
                          type="button"
                          className={isActive ? 'song-side-item is-active' : 'song-side-item'}
                          onClick={() => onSelectInstrument(instrument.id)}
                        >
                          <strong>{instrument.name}</strong>
                          <small>Aplicar a la canción actual</small>
                        </button>
                      );
                    })}
              </div>
            </aside>
          </>
        ) : null}

        <div className="song-rail-tools" aria-label="herramientas rápidas">
          {persistentTools.map((tool) => {
            const isLocked = tool.requiresPremium && !hasAdvancedAccess;
            return (
              <button
                key={tool.label}
                type="button"
                className={isLocked ? 'song-rail-tool-button is-locked' : 'song-rail-tool-button'}
                aria-disabled={isLocked}
                title={isLocked ? 'Disponible en Premium o compra individual' : tool.label}
                onClick={isLocked ? () => { openPremiumPlans(); } : undefined}
              >
                {tool.label}{isLocked ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
      </aside>

      <article className="song-main-card">
        <header className="song-headline">
          <div className="song-cover-card" aria-label="Portada de la canción">
            <div className="song-cover-frame">
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
          </div>

          <div className="song-headline-body">
            <div className="song-headline-row">
              <div className="song-headline-main">
                <h1>{song.title}</h1>
                <strong>
                  <Link
                    href={getArtistProfileHref({
                      artistId: selectedVersion?.artistId ?? song.artists?.[0]?.id,
                      artistName: selectedVersion?.artistName ?? song.artistName
                    })}
                  >
                    {selectedVersion?.artistName ?? song.artistName}
                  </Link>
                </strong>
              </div>

              <div className="song-access-cta-stack">
                {hasAdvancedAccess ? (
                  <span className="song-premium-badge is-active" title="Tienes acceso Premium">
                    ✓ Premium
                  </span>
                ) : (
                  <button type="button" className="song-premium-badge" onClick={openPremiumPlans}>
                    Premium
                  </button>
                )}

                {!hasAdvancedAccess && userAccess.canPurchaseIndividually ? (
                  <button type="button" className="song-premium-badge is-buy" onClick={onStartSongPurchase} disabled={isProcessingPurchase}>
                    {isProcessingPurchase
                      ? 'Procesando...'
                      : `Comprar esta canción${typeof userAccess.individualPriceUsd === 'number' ? ` ($${userAccess.individualPriceUsd.toFixed(2)})` : ''}`}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="song-action-row">
              <button type="button" className="song-scroll-button" onClick={() => setIsAutoScrolling((prev) => !prev)}>
                <Image src="/assets/utils/arrow-down/arrowdown2x.png" alt="Desplazar" width={16} height={16} />
                {isAutoScrolling ? 'Detener' : 'Desplazar'}
              </button>

              <div className="song-icon-rail" aria-label="acciones rápidas">
                <button
                  type="button"
                  className={isFavorite ? 'song-icon-action is-active' : 'song-icon-action'}
                  aria-label="Marcar favorito"
                  aria-pressed={isFavorite}
                  onClick={onToggleFavorite}
                >
                  <Image src="/assets/utils/heart/heart2x.png" alt="Favorito" width={18} height={18} />
                </button>

                <button
                  type="button"
                  className={[
                    'song-icon-action',
                    'song-audio-action',
                    isAudioPlaying ? 'is-playing' : '',
                    isAudioTriggering ? 'is-triggered' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={isAudioPlaying ? 'Pausar audio' : 'Reproducir audio'}
                  aria-pressed={isAudioPlaying}
                  onClick={onPlayReferenceAudio}
                >
                  <Image src="/assets/utils/volumeup/volumeup2x.png" alt="Audio" width={28} height={18} />
                  <span className="song-audio-bars" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
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
            </div>
          </div>
        </header>

        {!hasAdvancedAccess && userAccess.isAuthenticated ? (
          <div className="song-paywall-box" aria-label="acceso premium">
            <p>Algunas versiones y herramientas requieren plan Premium o compra individual.</p>
          </div>
        ) : !userAccess.isAuthenticated ? (
          <div className="song-paywall-box" aria-label="acceso premium">
            <p><button type="button" className="auth-toggle-link" onClick={openPremiumPlans}>Inicia sesión</button> para acceder a versiones Premium.</p>
          </div>
        ) : null}

        {songAccessMessage ? <p className="song-access-message">{songAccessMessage}</p> : null}

        <div className={isAutoScrolling ? 'song-speed-control is-visible' : 'song-speed-control'} aria-label="velocidad de desplazamiento">
          {scrollSpeedOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={scrollSpeed === option ? 'song-speed-pill is-active' : 'song-speed-pill'}
              onClick={() => setScrollSpeed(option)}
            >
              x{option}
            </button>
          ))}
        </div>

        <div className="song-variant-chip-row" aria-label="versión e instrumento actuales">
          <span className="song-chip">{selectedVersion?.versionName ?? selectedVersion?.label ?? 'Versión base'}</span>
          <span className="song-chip">{selectedInstrument?.name ?? 'Instrumento base'}</span>
        </div>

        <div className="song-lyrics-scroll" ref={lyricsRef}>
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
        </div>
      </article>
    </section>
  );
}

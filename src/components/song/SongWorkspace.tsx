'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getArtistProfileHref } from '../../features/artist/routing';
import { useAuth } from '../../context/AuthContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import {
  loadSongFavorite,
  loadSongUserPreferences,
  requestSongPurchaseIntent,
  saveSongFavorite,
  saveSongUserPreferences
} from '../../features/song/clientPersistence';
import type { SongDetail } from '../../types/song';

type SidePanelMode = 'versions' | 'instruments' | null;
type ScrollSpeed = 1 | 1.5 | 2;

interface SongWorkspaceProps {
  song: SongDetail;
}

export function SongWorkspace({ song }: SongWorkspaceProps) {
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
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>(null);
  const [selectedVersionId, setSelectedVersionId] = useState(song.currentVersionId);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(song.currentInstrumentId);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<ScrollSpeed>(1);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [songAccessMessage, setSongAccessMessage] = useState('');

  const lyricsRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTriggerTimeoutRef = useRef<number | null>(null);

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
    let isMounted = true;

    void loadSongFavorite(song.id).then((favorite) => {
      if (!isMounted || typeof favorite !== 'boolean') {
        return;
      }

      setIsFavorite(favorite);
    });

    return () => {
      isMounted = false;
    };
  }, [song.id]);

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

    if (!audioRef.current || audioRef.current.src !== audioSource) {
      audioRef.current?.pause();
      audioRef.current = new Audio(audioSource);
      audioRef.current.addEventListener('ended', () => setIsAudioPlaying(false));
      audioRef.current.addEventListener('pause', () => setIsAudioPlaying(false));
    }

    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
      return;
    }

    audioRef.current.currentTime = 0;
    void audioRef.current.play();
    setIsAudioPlaying(true);
    setSongAccessMessage('');
    triggerAudioFeedback();
  };

  const onToggleFavorite = () => {
    setIsFavorite((previousValue) => {
      const nextValue = !previousValue;
      void saveSongFavorite(song.id, nextValue);
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
          <div className="song-headline-main">
            <h1>{song.title}</h1>
            <strong>
              <Link href={getArtistProfileHref({ artistName: selectedVersion?.artistName ?? song.artistName })}>
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
        </header>

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
          </div>
        </div>

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
          <pre className="song-lyrics">{song.lyrics}</pre>

          {song.sheet ? <p className="song-sheet-hint">{song.sheet}</p> : null}
        </div>
      </article>
    </section>
  );
}

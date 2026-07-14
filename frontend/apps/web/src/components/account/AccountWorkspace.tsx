'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountSummary, invalidateAccountSummaryCache, softDeleteAccount } from '../../features/account/repository';
import type { AccountSummary } from '../../features/account/repository';
import { getCachedSearchDatasetClient, getSearchDatasetClient } from '../../features/search/repository';
import type { SearchrepertoireItem, SearchSongItem } from '../../types/search';
import type { SearchDataset } from '../../types/search';
import { LoadingBubble } from '../ui/LoadingBubble';

const STATUS_ORDER = ['DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'] as const;
type CanonicalStatus = (typeof STATUS_ORDER)[number];

const statusLabels: Record<CanonicalStatus, string> = {
  DRAFT: 'Borrador',
  UPLOADED: 'Archivo subido',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Archivada'
};

const statusToneClass: Record<CanonicalStatus, string> = {
  DRAFT: 'is-draft',
  UPLOADED: 'is-uploaded',
  IN_REVIEW: 'is-review',
  APPROVED: 'is-approved',
  REJECTED: 'is-rejected',
  PUBLISHED: 'is-published',
  ARCHIVED: 'is-archived'
};

function normalizeStatus(raw: unknown): CanonicalStatus {
  const value = String(raw ?? '').trim().toUpperCase();
  if (STATUS_ORDER.includes(value as CanonicalStatus)) {
    return value as CanonicalStatus;
  }
  return 'DRAFT';
}

type AccountSongListItem = {
  id: string;
  linkId: string;
  title: string;
  subtitle?: string;
  status: CanonicalStatus;
  imageUrl?: string;
};

type AccountrepertoireListItem = {
  id: string;
  linkId: string;
  title: string;
  subtitle?: string;
  status: CanonicalStatus;
  isPublic: boolean;
  imageUrl?: string;
};

function toRepertoireStatus(item: SearchrepertoireItem): CanonicalStatus {
  if (typeof item.status === 'string' && item.status.trim().length > 0) {
    return normalizeStatus(item.status);
  }

  if (item.isPublic) {
    return 'PUBLISHED';
  }
  return 'DRAFT';
}

function toSongStatus(item: SearchSongItem): CanonicalStatus {
  return normalizeStatus((item as SearchSongItem & { status?: unknown }).status);
}

function ThumbImage({ imageUrl, fallback, className }: { imageUrl?: string; fallback: string; className?: string }) {
  const [errored, setErrored] = useState(false);
  const src = imageUrl && !errored ? imageUrl : null;

  if (src) {
    return (
      <div className={`account-item-thumb ${className ?? ''}`} aria-hidden="true" style={{ position: 'relative' }}>
        <Image
          src={src}
          alt=""
          fill
          sizes="48px"
          unoptimized
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div className={`account-item-thumb ${className ?? ''}`} aria-hidden="true">{fallback}</div>
  );
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase() ?? '')
    .join('') || 'CU';
}

export function AccountWorkspace() {
  const { user, loading: authLoading } = useAuth();
  const [dataset, setDataset] = useState<SearchDataset | null>(() => getCachedSearchDatasetClient('catalog'));
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deleteAccountSuccess, setDeleteAccountSuccess] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void getSearchDatasetClient({ scope: 'catalog' }).then((resolved) => {
      if (!alive) return;
      setDataset(resolved);
    });

    return () => {
      alive = false;
    };
  }, [authLoading, user?.uid]);

  useEffect(() => {
    let alive = true;

    if (authLoading) {
      return () => {
        alive = false;
      };
    }

    if (!user?.uid) {
      setSummary(null);
      setSummaryError('Debes iniciar sesión para ver tu cuenta.');
      setSummaryLoading(false);
      return () => {
        alive = false;
      };
    }

    const load = async () => {
      setSummaryLoading(true);
      try {
        const response = await fetchAccountSummary();
        if (!alive) return;
        setSummary(response);
        setSummaryError(null);
      } catch (error) {
        if (!alive) return;
        setSummary(null);
        setSummaryError(error instanceof Error ? error.message : 'No se pudo cargar la cuenta.');
      } finally {
        if (!alive) return;
        setSummaryLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [authLoading, user?.uid]);

  const fallbackSongs = useMemo<AccountSongListItem[]>(() => {
    if (!dataset || !user?.uid) {
      return [];
    }

    return dataset.items
      .filter((item): item is SearchSongItem => item.kind === 'song' && item.ownerUserId === user.uid)
      .map((song) => {
        const status = toSongStatus(song);
        const songId = song.songId ?? song.id;
        return {
          id: song.id,
          linkId: songId,
          title: song.title,
          subtitle: song.subtitle,
          status,
          imageUrl: song.images?.[0]?.url
        };
      });
  }, [dataset, user?.uid]);

  const fallbackRepertoires = useMemo<AccountrepertoireListItem[]>(() => {
    if (!dataset || !user?.uid) {
      return [];
    }

    return dataset.items
      .filter((item): item is SearchrepertoireItem => item.kind === 'repertoire' && item.ownerUserId === user.uid)
      .map((entry) => {
        const status = toRepertoireStatus(entry);
        const repertoireId = entry.repertoireId ?? entry.id;
        return {
          id: entry.id,
          linkId: repertoireId,
          title: entry.title,
          subtitle: entry.subtitle,
          status,
          isPublic: Boolean(entry.isPublic),
          imageUrl: entry.images?.[0]?.url
        };
      });
  }, [dataset, user?.uid]);

  const summarySongs = useMemo<AccountSongListItem[]>(() => {
    if (!summary) {
      return [];
    }

    return summary.firestore.songs.map((song) => ({
      id: song.id,
      linkId: song.id,
      title: song.title,
      subtitle: song.subtitle,
      status: normalizeStatus(song.status),
      imageUrl: song.coverImageUrl
    }));
  }, [summary]);

  const summaryRepertoires = useMemo<AccountrepertoireListItem[]>(() => {
    if (!summary) {
      return [];
    }

    return summary.firestore.repertoires.map((item) => ({
      id: item.id,
      linkId: item.id,
      title: item.title,
      subtitle: item.subtitle,
      status: normalizeStatus(item.status),
      isPublic: Boolean(item.isPublic),
      imageUrl: item.coverImageUrl
    }));
  }, [summary]);

  const songItems = summary ? summarySongs : fallbackSongs;
  const repertoireItems = summary ? summaryRepertoires : fallbackRepertoires;

  const songDrafts = songItems.filter((song) => song.status === 'DRAFT').length;
  const songInReview = songItems.filter((song) => song.status === 'IN_REVIEW').length;
  const songApproved = songItems.filter((song) => song.status === 'APPROVED').length;
  const songPublished = songItems.filter((song) => song.status === 'PUBLISHED').length;

  const privateRepertoires = repertoireItems.filter((item) => !item.isPublic).length;
  const publicRepertoires = repertoireItems.filter((item) => item.isPublic).length;
  const totalSongs = songItems.length;
  const totalRepertoires = repertoireItems.length;
  const totalPublished = songPublished + publicRepertoires;
  const editorialPending = songDrafts + songInReview;

  const profileEmail = summary?.profile.email ?? user?.email ?? 'Sin correo';
  const profileName = summary?.profile.displayName ?? user?.displayName ?? user?.email ?? 'Sin nombre';
  const profileRole = summary?.profile.role ?? user?.role ?? 'usuario';
  const profilePlan = summary?.profile.plan ?? (summary?.profile.premium ?? user?.isPremium ? 'premium' : 'free');
  const profilePremium = summary?.profile.premium ?? user?.isPremium ?? false;
  const canBootstrapInitialAdmin = profileRole === 'admin';
  const profileInitials = getInitials(profileName);
  const visibleSongs = songItems.slice(0, 8);
  const visibleRepertoires = repertoireItems.slice(0, 8);
  const planLabel = profilePremium || profilePlan === 'premium' ? 'Premium' : 'Free';

  const handleSoftDeleteAccount = async () => {
    if (isDeletingAccount) {
      return;
    }

    const confirmed = window.confirm(
      '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción marcará tu cuenta como "away" y no podrás acceder a ella ni a tus contenidos. Los datos se conservarán en el sistema pero no serán visibles ni accesibles.'
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    setDeleteAccountSuccess(null);

    try {
      await softDeleteAccount();
      setDeleteAccountSuccess('Cuenta marcada como away. Serás redirigido al inicio de sesión.');
      invalidateAccountSummaryCache();

      setTimeout(() => {
        window.location.href = '/auth';
      }, 2000);
    } catch (error) {
      setDeleteAccountError(error instanceof Error ? error.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
   <div className="layout-h-margin">
    <LoadingBubble isLoading={authLoading || summaryLoading} message="Cargando tu cuenta…" />
    <section className="account-page-layout">
      <header className="account-page-head">
        <span className="account-page-kicker">Centro de control</span>
        <h1>Mi cuenta</h1>
        <p>Gestiona tu perfil, el flujo editorial de tu contenido y los accesos rápidos para seguir publicando música.</p>
      </header>

      {summaryLoading ? (
        <div className="account-loading-card" role="status">Cargando datos de tu cuenta...</div>
      ) : null}
      {summaryError ? <p className="create-form-error account-feedback">{summaryError}</p> : null}

      <section className="account-hero-grid" aria-label="resumen principal de cuenta">
        <article className="account-hero-card">
          <div className="account-profile-lockup">
            <div className="account-avatar" aria-hidden="true">{profileInitials}</div>
            <div>
              <span className="account-page-kicker">Perfil musical</span>
              <h2>{profileName}</h2>
              <p>{profileEmail}</p>
              <div className="account-profile-badges" aria-label="detalles del perfil">
                <span>{profileRole}</span>
                <span className={profilePremium || profilePlan === 'premium' ? 'is-premium' : ''}>{planLabel}</span>
              </div>
            </div>
          </div>

          <div className="account-hero-actions">
            <Link href="/profile" className="account-secondary-action">Editar perfil</Link>
            <Link href="/create/song" className="account-primary-action">Crear canción</Link>
            <Link href="/create/repertoires" className="account-secondary-action">Crear repertorio</Link>
          </div>
        </article>

        <article className="account-impact-card">
          <div>
            <span className="account-page-kicker">Impacto general</span>
            <h2>Tu biblioteca</h2>
          </div>
          <div className="account-impact-grid">
            <div>
              <span>Canciones</span>
              <strong>{totalSongs}</strong>
            </div>
            <div>
              <span>Repertorios</span>
              <strong>{totalRepertoires}</strong>
            </div>
            <div>
              <span>Publicadas</span>
              <strong>{totalPublished}</strong>
            </div>
            <div>
              <span>Pendientes</span>
              <strong>{editorialPending}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="account-kpi-grid" aria-label="resumen de cuenta">
        <article className="account-kpi-card">
          <small>Canciones en borrador</small>
          <strong>{songDrafts}</strong>
          <span>Listas para seguir editando.</span>
        </article>
        <article className="account-kpi-card">
          <small>En revisión</small>
          <strong>{songInReview}</strong>
          <span>Contenido esperando validación.</span>
        </article>
        <article className="account-kpi-card">
          <small>Canciones aprobadas</small>
          <strong>{songApproved}</strong>
          <span>Material listo para publicar.</span>
        </article>
        <article className="account-kpi-card">
          <small>Repertorios privados</small>
          <strong>{privateRepertoires}</strong>
          <span>Colecciones internas.</span>
        </article>
        <article className="account-kpi-card">
          <small>Repertorios públicos</small>
          <strong>{publicRepertoires}</strong>
          <span>Disponibles para la comunidad.</span>
        </article>
      </section>
  

      <section className="account-content-columns" aria-label="contenido reciente">
        <article className="account-card">
          <div className="account-section-head">
            <div>
              <span className="account-page-kicker">{totalSongs} canciones</span>
              <h2>Mis canciones recientes</h2>
            </div>
            <Link href="/search?type=song">Ver todas</Link>
          </div>
          {songItems.length === 0 ? (
            <div className="account-empty-state">
              <strong>Aún no tienes canciones registradas.</strong>
              <span>Crea tu primera canción para comenzar a construir tu biblioteca.</span>
              <Link href="/create/song">Crear canción</Link>
            </div>
          ) : null}
          <div className="account-items-grid" hidden={songItems.length === 0}>
            {visibleSongs.map((song) => (
              <div key={song.id} className="account-item-card">
                <ThumbImage imageUrl={song.imageUrl} fallback="♪" />
                <div className="account-item-main">
                  <strong>{song.title}</strong>
                  <small>{song.subtitle ?? 'Sin artista'}</small>
                  <span className={`account-state-pill ${statusToneClass[song.status]}`}>{statusLabels[song.status]}</span>
                </div>
                <div className="account-item-actions">
                  <Link href={`/songs/${song.linkId}/edit`}>Editar</Link>
                  <Link href={`/songs/${song.linkId}`}>Ver</Link>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="account-card">
          <div className="account-section-head">
            <div>
              <span className="account-page-kicker">{totalRepertoires} repertorios</span>
              <h2>Mis repertorios recientes</h2>
            </div>
            <Link href="/repertoires">Ver todos</Link>
          </div>
          {repertoireItems.length === 0 ? (
            <div className="account-empty-state">
              <strong>Aún no tienes repertorios registrados.</strong>
              <span>Organiza canciones por celebraciones, ciclos o agrupaciones.</span>
              <Link href="/create/repertoires">Crear repertorio</Link>
            </div>
          ) : null}
          <div className="account-items-grid" hidden={repertoireItems.length === 0}>
            {visibleRepertoires.map((item) => (
              <div key={item.id} className="account-item-card">
                <ThumbImage imageUrl={item.imageUrl} fallback="≡" className="is-repertoire" />
                <div className="account-item-main">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle ?? 'Sin descripción'}</small>
                  <span className={`account-state-pill ${statusToneClass[item.status]}`}>{statusLabels[item.status]}</span>
                </div>
                <div className="account-item-actions">
                  <Link href={`/repertoires/${item.linkId}/edit`}>Editar</Link>
                  <Link href={`/repertoires/${item.linkId}`}>Ver</Link>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {canBootstrapInitialAdmin ? (
        <article className="account-card account-admin-panel">
          <div className="account-section-head">
            <div>
              <span className="account-page-kicker">Administración</span>
              <h2>Panel administrativo</h2>
            </div>
          </div>
          <div className="account-admin-actions">
            <p className="account-admin-note">
              Las acciones globales de administración ahora viven en el panel dedicado.
            </p>
            <Link href="/admin/dashboard" className="account-secondary-action account-admin-button">
              Abrir panel de administración
            </Link>
          </div>
        </article>
      ) : null}

      <article className="account-card account-tools">
        <div className="account-section-head">
          <div>
            <span className="account-page-kicker">Administración</span>
            <h2>Herramientas de cuenta</h2>
          </div>
        </div>
        <div className="account-admin-actions">
          <p className="account-admin-note">
            Las acciones de administración global se gestionan desde el panel dedicado.
          </p>

          <Link href="/admin/dashboard" className="account-secondary-action account-admin-button">
            Abrir panel de administración
          </Link>

          <div className="account-danger-zone">
            <p>Zona de peligro: acciones destructivas de cuenta</p>
            <button
              type="button"
              className="account-danger-button"
              onClick={() => void handleSoftDeleteAccount()}
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? 'Eliminando cuenta...' : 'Eliminar mi cuenta'}
            </button>
            {deleteAccountError ? <p className="create-form-error">{deleteAccountError}</p> : null}
            {deleteAccountSuccess ? <p className="create-form-success">{deleteAccountSuccess}</p> : null}
          </div>
        </div>
      </article>
    </section>
   </div>
  );
}

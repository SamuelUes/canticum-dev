'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountSummary } from '../../features/account/repository';
import type { AccountSummary } from '../../features/account/repository';
import { getCachedSearchDatasetClient, getSearchDatasetClient } from '../../features/search/repository';
import type { SearchrepertoireItem, SearchSongItem } from '../../types/search';
import type { SearchDataset } from '../../types/search';

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
};

type AccountrepertoireListItem = {
  id: string;
  linkId: string;
  title: string;
  subtitle?: string;
  status: CanonicalStatus;
  isPublic: boolean;
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

function countByStatus(items: CanonicalStatus[]) {
  const map = new Map<CanonicalStatus, number>();
  STATUS_ORDER.forEach((status) => map.set(status, 0));
  items.forEach((status) => map.set(status, (map.get(status) ?? 0) + 1));
  return map;
}

export function AccountWorkspace() {
  const { user, loading: authLoading } = useAuth();
  const [dataset, setDataset] = useState<SearchDataset | null>(() => getCachedSearchDatasetClient('catalog'));
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
          status
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
          isPublic: Boolean(entry.isPublic)
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
      status: normalizeStatus(song.status)
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
      isPublic: Boolean(item.isPublic)
    }));
  }, [summary]);

  const songItems = summary ? summarySongs : fallbackSongs;
  const repertoireItems = summary ? summaryRepertoires : fallbackRepertoires;

  const songStatusSummary = useMemo(() => {
    if (summary) {
      const map = new Map<CanonicalStatus, number>();
      STATUS_ORDER.forEach((status) => {
        const cloudSqlValue = summary.stats.songs.cloudSql?.[status] ?? 0;
        const firestoreValue = summary.stats.songs.firestore?.[status] ?? 0;
        map.set(status, cloudSqlValue || firestoreValue || 0);
      });
      return map;
    }

    return countByStatus(songItems.map((item) => item.status));
  }, [summary, songItems]);

  const repertoireStatusSummary = useMemo(() => {
    if (summary) {
      const map = new Map<CanonicalStatus, number>();
      STATUS_ORDER.forEach((status) => {
        map.set(status, summary.stats.repertoires?.[status] ?? 0);
      });
      return map;
    }

    return countByStatus(repertoireItems.map((item) => item.status));
  }, [summary, repertoireItems]);

  const songDrafts = songItems.filter((song) => song.status === 'DRAFT').length;
  const songApproved = songItems.filter((song) => song.status === 'APPROVED').length;
  const songPublished = songItems.filter((song) => song.status === 'PUBLISHED').length;

  const privateRepertoires = repertoireItems.filter((item) => !item.isPublic).length;
  const publicRepertoires = repertoireItems.filter((item) => item.isPublic).length;

  const profileEmail = summary?.profile.email ?? user?.email ?? 'Sin correo';
  const profileName = summary?.profile.displayName ?? user?.displayName ?? user?.email ?? 'Sin nombre';
  const profileRole = summary?.profile.role ?? user?.role ?? 'usuario';
  const profilePlan = summary?.profile.plan ?? (summary?.profile.premium ?? user?.isPremium ? 'premium' : 'free');
  const profilePremium = summary?.profile.premium ?? user?.isPremium ?? false;

  return (
    <section className="account-page-layout layout-h-margin">
      <header className="account-page-head">
        <h1>Mi cuenta</h1>
        <p>Gestiona tu perfil, estados de contenido y acceso rápido a edición de canciones y repertorios.</p>
      </header>

      {summaryLoading ? <p>Cargando datos de tu cuenta...</p> : null}
      {summaryError ? <p className="create-form-error">{summaryError}</p> : null}

      <article className="account-card">
        <h2>Datos básicos</h2>
        <div className="account-basic-grid">
          <div>
            <span>Correo</span>
            <strong>{profileEmail}</strong>
          </div>
          <div>
            <span>Nombre</span>
            <strong>{profileName}</strong>
          </div>
          <div>
            <span>Tipo Perfil</span>
            <strong>{profileRole}</strong>
          </div>
          <div>
            <span>Plan</span>
            <strong>{profilePremium ? 'Premium' : profilePlan === 'premium' ? 'Premium' : 'Free'}</strong>
          </div>
        </div>
      </article>

      <section className="account-kpi-grid" aria-label="resumen de cuenta">
        <article className="account-kpi-card">
          <small>Canciones en draft</small>
          <strong>{songDrafts}</strong>
        </article>
        <article className="account-kpi-card">
          <small>Canciones aprobadas</small>
          <strong>{songApproved}</strong>
        </article>
        <article className="account-kpi-card">
          <small>Canciones publicadas</small>
          <strong>{songPublished}</strong>
        </article>
        <article className="account-kpi-card">
          <small>Repertorios privados</small>
          <strong>{privateRepertoires}</strong>
        </article>
        <article className="account-kpi-card">
          <small>Repertorios públicos</small>
          <strong>{publicRepertoires}</strong>
        </article>
      </section>

      <article className="account-card">
        <h2>Estados actuales de canciones</h2>
        <ul className="account-status-list">
          {STATUS_ORDER.map((status) => (
            <li key={`song-${status}`}>
              <span>{statusLabels[status]}</span>
              <strong>{songStatusSummary.get(status) ?? 0}</strong>
            </li>
          ))}
        </ul>
      </article>

      <article className="account-card">
        <h2>Estados actuales de repertorios</h2>
        <ul className="account-status-list">
          {STATUS_ORDER.map((status) => (
            <li key={`repertoire-${status}`}>
              <span>{statusLabels[status]}</span>
              <strong>{repertoireStatusSummary.get(status) ?? 0}</strong>
            </li>
          ))}
        </ul>
      </article>

      <article className="account-card">
        <h2>Mis canciones</h2>
        {songItems.length === 0 ? <p>Aún no tienes canciones registradas.</p> : null}
        <div className="account-items-grid" hidden={songItems.length === 0}>
          {songItems.map((song) => (
            <div key={song.id} className="account-item-card">
              <div>
                <strong>{song.title}</strong>
                <small>{song.subtitle ?? 'Sin artista'}</small>
              </div>
              <span className="account-state-pill">{statusLabels[song.status]}</span>
              <div className="account-item-actions">
                <Link href={`/songs/${song.linkId}`}>Ver</Link>
                <Link href={`/songs/${song.linkId}/edit`}>Editar</Link>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="account-card">
        <h2>Mis repertorios</h2>
        {repertoireItems.length === 0 ? <p>Aún no tienes repertorios registrados.</p> : null}
        <div className="account-items-grid" hidden={repertoireItems.length === 0}>
          {repertoireItems.map((item) => (
            <div key={item.id} className="account-item-card">
              <div>
                <strong>{item.title}</strong>
                <small>{item.subtitle ?? 'Sin descripción'}</small>
              </div>
              <span className="account-state-pill">{statusLabels[item.status]}</span>
              <div className="account-item-actions">
                <Link href={`/repertoires/${item.linkId}`}>Ver</Link>
                <Link href={`/repertoires/${item.linkId}/edit`}>Editar</Link>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser, BOOTSTRAP_ADMIN_UID } from '../../features/auth/repository';
import { bulkDeleteSongsBeforeDate, deleteAdminUser, fetchAdminDashboardMetrics, fetchAdminUsers, fetchDraftSongs, fetchNewsletterImage, uploadNewsletterImage, updateAdminUser, fetchArtists, type AdminDashboardMetrics, type AdminUserSummary, type DraftSong, type Artist } from '../../features/admin/repository';

type DashboardMetric = {
  label: string;
  value: string;
  icon: string;
  tone: 'default' | 'success' | 'warning';
  href?: string;
};

function formatStatusLabel(status: string): string {
  if (status === 'away') {
    return 'Suspendido';
  }

  if (status === 'active') {
    return 'Activo';
  }

  return status;
}

function formatRoleLabel(role: string): string {
  if (role === 'admin') {
    return 'Admin';
  }

  if (role === 'moderator') {
    return 'Moderador';
  }

  if (role === 'editor') {
    return 'Editor';
  }

  return 'Usuario';
}

function getMetricToneClass(tone: DashboardMetric['tone']): string {
  if (tone === 'success') {
    return 'is-success';
  }

  if (tone === 'warning') {
    return 'is-warning';
  }

  return '';
}

export function AdminPanelWorkspace() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [draftSongs, setDraftSongs] = useState<DraftSong[]>([]);
  const [draftSongsLoading, setDraftSongsLoading] = useState(true);
  const [draftSongsPagination, setDraftSongsPagination] = useState({ total: 0, limit: 10, offset: 0 });
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistsPagination, setArtistsPagination] = useState({ total: 0, limit: 10, offset: 0 });
  const [newsletterImageUrl, setNewsletterImageUrl] = useState<string | null>(null);
  const [newsletterLoading, setNewsletterLoading] = useState(true);
  const [newsletterUploading, setNewsletterUploading] = useState(false);

  const isAdmin = isAdminUser(user);
  const isBootstrapAccount = user?.uid === BOOTSTRAP_ADMIN_UID;

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAdmin || !user) {
      setUsersLoading(false);
      return;
    }

    let alive = true;

    const loadUsers = async () => {
      setUsersLoading(true);
      setUsersError(null);

      try {
        const items = await fetchAdminUsers(12);
        if (!alive) return;
        setAdminUsers(items);
      } catch (error) {
        if (!alive) return;
        setUsersError(error instanceof Error ? error.message : 'No se pudo cargar la lista de usuarios.');
      } finally {
        if (alive) {
          setUsersLoading(false);
        }
      }
    };

    void loadUsers();

    return () => {
      alive = false;
    };
  }, [loading, isAdmin, user]);

  useEffect(() => {
    if (loading || !isAdmin || !user) {
      setMetricsLoading(false);
      return;
    }

    let alive = true;

    const loadMetrics = async () => {
      setMetricsLoading(true);
      try {
        const data = await fetchAdminDashboardMetrics();
        if (!alive) return;
        setMetrics(data);
      } catch (error) {
        if (!alive) return;
        console.error('Failed to load metrics:', error);
      } finally {
        if (alive) {
          setMetricsLoading(false);
        }
      }
    };

    void loadMetrics();

    return () => {
      alive = false;
    };
  }, [loading, isAdmin, user]);

  useEffect(() => {
    if (loading || !isAdmin || !user) {
      setDraftSongsLoading(false);
      return;
    }

    let alive = true;

    const loadDraftSongs = async () => {
      setDraftSongsLoading(true);
      try {
        const data = await fetchDraftSongs(draftSongsPagination.limit, draftSongsPagination.offset);
        if (!alive) return;
        setDraftSongs(data.songs);
        setDraftSongsPagination({ total: data.total, limit: data.limit, offset: data.offset });
      } catch (error) {
        if (!alive) return;
        console.error('Failed to load draft songs:', error);
      } finally {
        if (alive) {
          setDraftSongsLoading(false);
        }
      }
    };

    void loadDraftSongs();

    return () => {
      alive = false;
    };
  }, [loading, isAdmin, user, draftSongsPagination.offset, draftSongsPagination.limit]);

  useEffect(() => {
    if (loading || !isAdmin || !user) {
      setArtistsLoading(false);
      return;
    }

    let alive = true;

    const loadArtists = async () => {
      setArtistsLoading(true);
      try {
        const data = await fetchArtists(artistsPagination.limit, artistsPagination.offset);
        if (!alive) return;
        setArtists(data.artists);
        setArtistsPagination({ total: data.total, limit: data.limit, offset: data.offset });
      } catch (error) {
        if (!alive) return;
        console.error('Failed to load artists:', error);
      } finally {
        if (alive) {
          setArtistsLoading(false);
        }
      }
    };

    void loadArtists();

    return () => {
      alive = false;
    };
  }, [loading, isAdmin, user, artistsPagination.offset, artistsPagination.limit]);

  useEffect(() => {
    if (loading || !isAdmin || !user) {
      setNewsletterLoading(false);
      return;
    }

    let alive = true;

    const loadNewsletter = async () => {
      setNewsletterLoading(true);
      try {
        const imageUrl = await fetchNewsletterImage();
        if (!alive) return;
        setNewsletterImageUrl(imageUrl);
      } catch (error) {
        if (!alive) return;
        console.error('Failed to load newsletter image:', error);
      } finally {
        if (alive) {
          setNewsletterLoading(false);
        }
      }
    };

    void loadNewsletter();

    return () => {
      alive = false;
    };
  }, [loading, isAdmin, user]);

  const dashboardMetrics: DashboardMetric[] = [
    { label: 'Pendientes', value: metricsLoading ? '...' : String(metrics?.pendingSongs ?? 0), icon: 'pending_actions', tone: 'warning', href: '#draft-songs' },
    { label: 'Canciones', value: metricsLoading ? '...' : String(metrics?.totalSongs ?? 0), icon: 'music_note', tone: 'default', href: '/songs' },
    { label: 'Artistas', value: metricsLoading ? '...' : String(metrics?.totalArtists ?? 0), icon: 'mic', tone: 'default', href: '/artists' },
    { label: 'Nuevos usuarios (48h)', value: metricsLoading ? '...' : `+${metrics?.newUsersLast48h ?? 0}`, icon: 'person_add', tone: 'success', href: '#users' }
  ];

  const syncUser = (updated: AdminUserSummary) => {
    setAdminUsers((current) => {
      const index = current.findIndex((entry) => entry.uid === updated.uid);
      if (index === -1) {
        return [updated, ...current];
      }

      const next = [...current];
      next[index] = updated;
      return next;
    });
  };


  const handleBulkDeleteOldSongs = async () => {
    if (bulkDeleteLoading) {
      return;
    }

    const confirmed = window.confirm(
      '¿Estás seguro? Esta acción eliminará TODAS las canciones creadas antes del 10 de agosto de 2026. Esta acción no se puede deshacer.'
    );

    if (!confirmed) {
      return;
    }

    setBulkDeleteLoading(true);
    setActivityMessage(null);

    try {
      const result = await bulkDeleteSongsBeforeDate();
      setActivityMessage(result.message ?? `Eliminadas ${result.deletedCount} canciones.`);
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : 'No se pudo completar la eliminación.');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleUpdateUserStatus = async (uid: string, status: 'active' | 'away') => {
    setPendingUid(uid);
    setActivityMessage(null);

    try {
      const updated = await updateAdminUser(uid, { status });
      syncUser(updated);
      setActivityMessage(status === 'away' ? 'Usuario suspendido correctamente.' : 'Usuario reactivado correctamente.');
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : 'No se pudo actualizar el usuario.');
    } finally {
      setPendingUid(null);
    }
  };

  const handleToggleAdminRole = async (uid: string, role: string) => {
    const nextRole = role === 'admin' ? 'user' : 'admin';
    setPendingUid(uid);
    setActivityMessage(null);

    try {
      const updated = await updateAdminUser(uid, { role: nextRole });
      syncUser(updated);
      setActivityMessage(nextRole === 'admin' ? 'Usuario promovido a admin.' : 'Rol de admin removido.');
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : 'No se pudo actualizar el rol.');
    } finally {
      setPendingUid(null);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    const confirmed = window.confirm('¿Eliminar este usuario? Se marcará como away y se sincronizará en Cloud SQL y Firestore.');

    if (!confirmed) {
      return;
    }

    setPendingUid(uid);
    setActivityMessage(null);

    try {
      const updated = await deleteAdminUser(uid);
      syncUser(updated);
      setActivityMessage('Usuario eliminado correctamente.');
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : 'No se pudo eliminar el usuario.');
    } finally {
      setPendingUid(null);
    }
  };

  const handleNewsletterUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUsersError('Solo se permiten archivos de imagen.');
      return;
    }

    setNewsletterUploading(true);
    setActivityMessage(null);
    setUsersError(null);

    try {
      const result = await uploadNewsletterImage(file);
      setNewsletterImageUrl(result.imageUrl);
      setActivityMessage('Imagen del newsletter actualizada correctamente.');
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'No se pudo subir la imagen del newsletter.');
    } finally {
      setNewsletterUploading(false);
    }
  };

  if (loading) {
    return (
      <section className="admin-panel-shell layout-h-margin">
        <header className="admin-panel-hero">
          <div>
            <span className="admin-panel-kicker">Panel de Administración</span>
            <h1>Cargando permisos...</h1>
            <p>Estamos validando tu sesión antes de mostrar las herramientas de administración.</p>
          </div>
        </header>
      </section>
    );
  }

  if (!user || !isAdmin) {
    return (
      <section className="admin-panel-shell layout-h-margin">
        <header className="admin-panel-hero">
          <div>
            <span className="admin-panel-kicker">Panel de Administración</span>
            <h1>Acceso restringido</h1>
            <p>Solo las cuentas con rol admin pueden abrir este panel.</p>
          </div>
          <button type="button" className="admin-primary-button" onClick={() => router.push('/')}>
            Volver al inicio
          </button>
        </header>
      </section>
    );
  }

  return (
    <section className="admin-panel-shell layout-h-margin" id="admin-panel-top">
      <header className="admin-panel-hero">
        <div>
          <span className="admin-panel-kicker">Panel de Administración</span>
          <h1>Gestión centralizada del catálogo y usuarios.</h1>
          <p>Monitorea moderación, administra accesos, publica contenido editorial y controla el estado de la plataforma.</p>
        </div>

        <button type="button" className="admin-primary-button" onClick={() => router.push('/create/song')}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          Nuevo Registro
        </button>
      </header>

      {activityMessage ? <p className="create-form-success admin-panel-feedback">{activityMessage}</p> : null}
      {usersError ? <p className="create-form-error admin-panel-feedback">{usersError}</p> : null}

      <section className="admin-kpi-grid" aria-label="resumen operativo">
        {dashboardMetrics.map((metric) => {
          const content = (
            <>
              <div className="admin-kpi-icon" aria-hidden="true">
                <span className="material-symbols-outlined">{metric.icon}</span>
              </div>
              <span className="admin-kpi-label">{metric.label}</span>
              <strong>{metric.value}</strong>
            </>
          );

          const href = metric.href;

          if (!href) {
            return (
              <article key={metric.label} className={`admin-kpi-card ${getMetricToneClass(metric.tone)}`}>
                {content}
              </article>
            );
          }

          if (href.startsWith('#')) {
            return (
              <button
                key={metric.label}
                type="button"
                className={`admin-kpi-card ${getMetricToneClass(metric.tone)} admin-kpi-card--clickable`}
                onClick={() => document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {content}
              </button>
            );
          }

          return (
            <Link key={metric.label} href={href} className={`admin-kpi-card ${getMetricToneClass(metric.tone)} admin-kpi-card--clickable`}>
              {content}
            </Link>
          );
        })}
      </section>

      <section className="admin-columns">
        <article className="admin-card admin-newsletter-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Contenido editorial</span>
              <h2>Newsletter</h2>
            </div>
            <Link href="/" className="admin-inline-link">
              Ver portada
            </Link>
          </div>

          <div className="admin-newsletter-preview">
            {newsletterLoading ? (
              <p>Cargando imagen del newsletter...</p>
            ) : newsletterImageUrl ? (
              <div className="admin-newsletter-image-container">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={newsletterImageUrl} alt="Newsletter" className="admin-newsletter-image" />
              </div>
            ) : (
              <p>No hay imagen del newsletter configurada.</p>
            )}

            <div className="admin-newsletter-upload">
              <input
                type="file"
                id="newsletter-upload"
                accept="image/*"
                disabled={newsletterUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleNewsletterUpload(file);
                  }
                }}
                className="admin-file-input"
              />
              <label
                htmlFor="newsletter-upload"
                className={`admin-secondary-button ${newsletterUploading ? 'admin-secondary-button--disabled' : ''}`}
              >
                {newsletterUploading ? 'Subiendo...' : 'Subir nueva imagen'}
              </label>
            </div>
          </div>
        </article>

        <article className="admin-card admin-tools-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Herramientas de cuenta</span>
              <h2>Acciones globales</h2>
            </div>
          </div>

          <div className="admin-tools-stack">
            <p className="admin-note">Esta cuenta puede administrar privilegios y operaciones globales del catálogo.</p>

            {/* <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void handleBootstrapInitialAdmin()}
              disabled={bootstrapLoading || !isBootstrapAccount}
            >
              {bootstrapLoading ? 'Activando...' : 'Activar admin inicial'}
            </button> */}

            <button
              type="button"
              className="admin-danger-button"
              onClick={() => void handleBulkDeleteOldSongs()}
              disabled={bulkDeleteLoading}
            >
              {bulkDeleteLoading ? 'Eliminando...' : 'Eliminar canciones antes del 10 de agosto de 2026'}
            </button>

            {!isBootstrapAccount ? <p className="admin-note admin-note--muted">Solo la cuenta bootstrap puede activar el admin inicial.</p> : null}
          </div>
        </article>
      </section>

      <section id="draft-songs">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Canciones</span>
            <h2>Canciones en Borrador</h2>
          </div>
          <span className="admin-inline-muted">{draftSongsLoading ? 'Cargando...' : `${draftSongs.length} de ${draftSongsPagination.total}`}</span>
        </div>
        <div className="admin-table-shell">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Song Title</th>
                <th>Artist</th>
                <th>Date</th>
                <th>Status</th>
                <th className="admin-table-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {draftSongsLoading ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">Cargando canciones...</td>
                </tr>
              ) : draftSongs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">No hay canciones en borrador.</td>
                </tr>
              ) : (
                draftSongs.map((song) => (
                  <tr key={song.id}>
                    <td className="admin-table-title">{song.title}</td>
                    <td>{song.artistName ?? 'Sin artista'}</td>
                    <td>{new Date(song.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`admin-status-pill is-${song.stateCode.toLowerCase()}`}>
                        {song.stateCode}
                      </span>
                    </td>
                    <td className="admin-row-actions">
                      <button
                        type="button"
                        role="button"
                        className="admin-icon-button"
                        title="Verify"
                        disabled={!song.firestoreId}
                        onClick={() => song.firestoreId && router.push(`/songs/${song.firestoreId}`)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                      </button>
                      <button
                        type="button"
                        className="admin-icon-button"
                        title="Edit"
                        disabled={!song.firestoreId}
                        onClick={() => song.firestoreId && router.push(`/songs/${song.firestoreId}/edit`)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {draftSongsPagination.total > draftSongsPagination.limit && (
          <div className="admin-pagination">
            <button
              type="button"
              className="admin-secondary-button"
              disabled={draftSongsPagination.offset === 0 || draftSongsLoading}
              onClick={() => setDraftSongsPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            >
              Anterior
            </button>
            <span className="admin-pagination-info">
              Página {Math.floor(draftSongsPagination.offset / draftSongsPagination.limit) + 1} de {Math.ceil(draftSongsPagination.total / draftSongsPagination.limit)}
            </span>
            <button
              type="button"
              className="admin-secondary-button"
              disabled={draftSongsPagination.offset + draftSongsPagination.limit >= draftSongsPagination.total || draftSongsLoading}
              onClick={() => setDraftSongsPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            >
              Siguiente
            </button>
          </div>
        )}
      </section>

      <section id="artists">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Artistas</span>
            <h2>Todos los Artistas</h2>
          </div>
          <span className="admin-inline-muted">{artistsLoading ? 'Cargando...' : `${artists.length} de ${artistsPagination.total}`}</span>
        </div>
        <div className="admin-table-shell">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Canciones</th>
                <th>Fecha de creación</th>
                <th className="admin-table-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {artistsLoading ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">Cargando artistas...</td>
                </tr>
              ) : artists.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">No hay artistas.</td>
                </tr>
              ) : (
                artists.map((artist) => (
                  <tr key={artist.id}>
                    <td className="admin-table-title">{artist.name}</td>
                    <td>{artist.songCount}</td>
                    <td>{new Date(artist.createdAt).toLocaleDateString()}</td>
                    <td className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-icon-button"
                        title="View Artist"
                        onClick={() => router.push(`/artists/${artist.id}`)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                      </button>
                      <button
                        type="button"
                        className="admin-icon-button"
                        title="Edit Artist"
                        onClick={() => router.push(`/admin/artists/edit/${artist.id}`)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {artistsPagination.total > artistsPagination.limit && (
          <div className="admin-pagination">
            <button
              type="button"
              className="admin-secondary-button"
              disabled={artistsPagination.offset === 0 || artistsLoading}
              onClick={() => setArtistsPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            >
              Anterior
            </button>
            <span className="admin-pagination-info">
              Página {Math.floor(artistsPagination.offset / artistsPagination.limit) + 1} de {Math.ceil(artistsPagination.total / artistsPagination.limit)}
            </span>
            <button
              type="button"
              className="admin-secondary-button"
              disabled={artistsPagination.offset + artistsPagination.limit >= artistsPagination.total || artistsLoading}
              onClick={() => setArtistsPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            >
              Siguiente
            </button>
          </div>
        )}
      </section>



      <section id="users">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Usuarios</span>
            <h2>Gestión de cuentas</h2>
          </div>
          <span className="admin-inline-muted">{usersLoading ? 'Cargando usuarios...' : `${adminUsers.length} cuentas`}</span>
        </div>

        {usersLoading ? (
          <div className="admin-empty-state">Cargando el listado de usuarios...</div>
        ) : adminUsers.length === 0 ? (
          <div className="admin-empty-state">
            <strong>No hay usuarios para mostrar.</strong>
            <span>Cuando el backend responda, el panel listará las cuentas activas y suspendidas.</span>
          </div>
        ) : (
          <div className="admin-user-grid">
            {adminUsers.map((entry) => {
              const isBusy = pendingUid === entry.uid;
              const canEditSelf = entry.uid !== user.uid;

              return (
                <article key={entry.uid} className="admin-user-card">
                  <div className="admin-user-card-head">
                    <div>
                      <h3>{entry.displayName ?? entry.email ?? entry.uid}</h3>
                      <p>{entry.email ?? 'Sin correo'}</p>
                    </div>
                    <div className="admin-user-badges">
                      <span className="admin-status-pill">{formatRoleLabel(entry.role)}</span>
                      <span className={`admin-status-pill ${entry.status === 'away' ? 'is-rejected' : 'is-approved'}`}>{formatStatusLabel(entry.status)}</span>
                    </div>
                  </div>

                  <div className="admin-user-meta">
                    <span>{entry.plan}</span>
                    <span>{entry.premium ? 'Premium' : 'Free'}</span>
                    <span>{entry.createdAt ?? 'Sin fecha'}</span>
                  </div>

                  <div className="admin-user-actions">
                    <button type="button" className="admin-secondary-button" disabled={isBusy} onClick={() => void handleUpdateUserStatus(entry.uid, entry.status === 'away' ? 'active' : 'away')}>
                      {entry.status === 'away' ? 'Reactivar' : 'Suspender'}
                    </button>

                    <button type="button" className="admin-secondary-button" disabled={isBusy || !canEditSelf} onClick={() => void handleToggleAdminRole(entry.uid, entry.role)}>
                      {entry.role === 'admin' ? 'Quitar admin' : 'Promover admin'}
                    </button>

                    <button type="button" className="admin-danger-button" disabled={isBusy || !canEditSelf} onClick={() => void handleDeleteUser(entry.uid)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requestDeleterepertoire, requestUserRepertoires, loadRepertoireBookmark, saveRepertoireBookmark } from '../../features/repertoire/clientPersistence';
import { getRepertoireStatusLabel, normalizeRepertoireStatus } from '../../features/repertoire/status';
import { SkeletonCard } from '../ui/skeleton';
import type { repertoireListItem, repertoireStatus } from '../../types/repertoire';

interface MyrepertoiresWorkspaceProps {
  /** Initial items resolved on the server (via __session cookie). May be empty if SSR could not resolve the user. */
  items?: repertoireListItem[];
}

export function MyrepertoiresWorkspace({ items: initialItems = [] }: MyrepertoiresWorkspaceProps) {
  const router = useRouter();
  const [items, setItems] = useState<repertoireListItem[]>(initialItems);
  const [isLoading, setIsLoading] = useState<boolean>(initialItems.length === 0);
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<repertoireStatus[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'alpha'>('recent');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [bookmarkedRepertoires, setBookmarkedRepertoires] = useState<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;

    const hydrate = async () => {
      try {
        const fetched = await requestUserRepertoires();
        if (disposed) return;
        if (Array.isArray(fetched)) {
          setItems(fetched);
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      disposed = true;
    };
  }, []);

  // Load bookmark states for repertoires
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    items.forEach((item) => {
      void loadRepertoireBookmark(item.id).then((isBookmarked) => {
        if (typeof isBookmarked === 'boolean') {
          setBookmarkedRepertoires((prev) => {
            const next = new Set(prev);
            if (isBookmarked) {
              next.add(item.id);
            } else {
              next.delete(item.id);
            }
            return next;
          });
        }
      });
    });
  }, [items]);

  const toggleBookmark = async (repertoireId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const isCurrentlyBookmarked = bookmarkedRepertoires.has(repertoireId);
    const newState = !isCurrentlyBookmarked;

    // Optimistic update
    setBookmarkedRepertoires((prev) => {
      const next = new Set(prev);
      if (newState) {
        next.add(repertoireId);
      } else {
        next.delete(repertoireId);
      }
      return next;
    });

    // Persist to backend
    await saveRepertoireBookmark(repertoireId, newState);
  };

  const liturgicalTypes = useMemo(() => Array.from(new Set(items.map((item) => item.liturgicalType))), [items]);

  const toggleType = (value: string) => {
    setSelectedTypes((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  };

  const toggleStatus = (value: repertoireStatus) => {
    setSelectedStatuses((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  };

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const visible = items.filter((item) => {
      if (hiddenIds.includes(item.id)) {
        return false;
      }

      const byQuery =
        normalizedQuery.length === 0 ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.subtitle.toLowerCase().includes(normalizedQuery);

      const byType = selectedTypes.length === 0 || selectedTypes.includes(item.liturgicalType);
      const byStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);

      return byQuery && byType && byStatus;
    });

    if (sortBy === 'alpha') {
      return [...visible].sort((a, b) => a.title.localeCompare(b.title));
    }

    return [...visible].sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
  }, [hiddenIds, items, query, selectedStatuses, selectedTypes, sortBy]);

  const getSongsCount = (item: repertoireListItem): number => {
    if (Array.isArray(item.songIds) && item.songIds.length > 0) {
      return item.songIds.length;
    }

    return item.songsCount;
  };

  const getSheetsCount = (item: repertoireListItem): number => {
    if (Array.isArray(item.songIds) && item.songIds.length > 0) {
      return item.songIds.length;
    }

    return item.sheetsCount;
  };

  const onDelete = async (item: repertoireListItem) => {
    const shouldDelete = window.confirm(`¿Eliminar el repertorio \"${item.title}\"?`);
    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleterepertoire(item.id);
    if (!result.ok) {
      window.alert('No se pudo eliminar el repertorio.');
      return;
    }

    setHiddenIds((prev) => [...prev, item.id]);
  };

  return (
    <section className="repertoires-page-container">
      <aside className="repertoires-sidebar" aria-label="Filtros de repertorios">
        <div className="repertoires-filter-panel">
          <h3 className="repertoires-filter-header">
            <span className="material-symbols-outlined">filter_list</span>
            Filtros
          </h3>

          <div className="repertoires-filter-group">
            <span className="repertoires-filter-label">Tipo Litúrgico</span>
            {liturgicalTypes.map((type) => (
              <label key={type} className="repertoires-checkbox-row">
                <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />
                <span>{type}</span>
              </label>
            ))}
          </div>

          <div className="repertoires-filter-group">
            <span className="repertoires-filter-label">Estado</span>
            {(['Borrador', 'Publicado'] as repertoireStatus[]).map((status) => (
              <label key={status} className="repertoires-checkbox-row">
                <input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => toggleStatus(status)} />
                <span>{status}</span>
              </label>
            ))}
          </div>

          <div className="repertoires-filter-group">
            <span className="repertoires-filter-label">Ordenar Por</span>
            <select className="repertoires-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'recent' | 'alpha')}>
              <option value="recent">Más reciente</option>
              <option value="alpha">Alfabético (A-Z)</option>
              <option value="alpha-desc">Alfabético (Z-A)</option>
              <option value="oldest">Antiguos</option>
            </select>
          </div>
        </div>
      </aside>

      <main className="repertoires-content">
        <header className="repertoires-header">
          <div className="repertoires-header-text">
            <h1 className="repertoires-title">Mis repertorios Litúrgicos</h1>
            <p className="repertoires-subtitle">Gestiona y organiza la música para las próximas celebraciones.</p>
          </div>
          <button type="button" className="repertoires-cta-button" onClick={() => router.push('/create/repertoires')}>
            <span className="material-symbols-outlined">add_circle</span>
            Crear Nuevo repertorio
          </button>
        </header>

        <div className="repertoires-search-bar">
          <div className="repertoires-search-input-wrap">
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Buscar por título, ocasión o fecha..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="repertoires-search-divider"></div>
          <button type="button" className="repertoires-date-button">
            <span className="material-symbols-outlined">calendar_month</span>
            Fecha
          </button>
        </div>

        {isLoading ? (
          <div className="repertoires-cards-grid" aria-busy aria-label="Cargando repertorios">
            <SkeletonCard count={6} className="repertoires-skeleton-card" />
          </div>
        ) : null}
  
        {!isLoading && filteredItems.length === 0 ? (
          <div className="repertoires-empty-state">
            <span className="material-symbols-outlined">folder_open</span>
            <h3>Aún no tienes repertorios</h3>
            <p>Crea tu primer repertorio con el botón &quot;Crear Nuevo repertorio&quot;</p>
          </div>
        ) : null}

        <div className="repertoires-cards-grid" hidden={isLoading}>
          {filteredItems.map((item) => (
            <article key={item.id} className="repertoires-card" onClick={() => router.push(`/repertoires/${item.id}`)} style={{ cursor: 'pointer' }}>
              <div className="repertoires-card-image">
                {item.coverImageUrl ? (
                  <Image
                    src={item.coverImageUrl}
                    alt={`Portada de ${item.title}`}
                    fill
                    className="repertoires-card-image-img"
                    sizes="(max-width: 768px) 100vw, 320px"
                  />
                ) : (
                  <div className="repertoires-card-placeholder">
                    <span className="material-symbols-outlined">church</span>
                  </div>
                )}
                <div className="repertoires-card-overlay"></div>
                <div className="repertoires-card-badges">
                  <span className={`repertoires-status-badge ${normalizeRepertoireStatus(item.status) === 'PUBLISHED' ? 'published' : 'draft'}`}>
                    <span className="material-symbols-outlined">
                      {normalizeRepertoireStatus(item.status) === 'PUBLISHED' ? 'check_circle' : 'edit_document'}
                    </span>
                    {getRepertoireStatusLabel(item.status)}
                  </span>
                </div>
                <button
                  className={`repertoire-bookmark-button ${bookmarkedRepertoires.has(item.id) ? 'is-bookmarked' : ''}`}
                  aria-label={bookmarkedRepertoires.has(item.id) ? 'Quitar de guardados' : 'Guardar repertorio'}
                  onClick={(e) => { e.stopPropagation(); void toggleBookmark(item.id, e); }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {bookmarkedRepertoires.has(item.id) ? 'bookmark_added' : 'bookmark'}
                  </span>
                </button>
              </div>

              <div className="repertoires-card-content">
                <div className="repertoires-card-header">
                  <div>
                    <h3 className="repertoires-card-title">{item.title}</h3>
                    <p className="repertoires-card-date">
                      <span className="material-symbols-outlined">event</span>
                      {item.dateLabel}
                    </p>
                  </div>
                  <span className={`repertoires-visibility-badge ${item.isPublic ? 'public' : 'private'}`}>
                    {item.isPublic ? 'Público' : 'Privado'}
                  </span>
                </div>

                <div className="repertoires-card-meta">
                  <div className="repertoires-meta-item">
                    <span className="material-symbols-outlined">queue_music</span>
                    {getSongsCount(item)} Cantos
                  </div>
                  <div className="repertoires-meta-item">
                    <span className="material-symbols-outlined">menu_book</span>
                    {getSheetsCount(item)} Lecturas
                  </div>
                </div>
              </div>

              <div className="repertoires-card-actions">
                <div className="repertoires-actions-left">
                  <button type="button" aria-label="Editar repertorio" onClick={(e) => { e.stopPropagation(); router.push(`/repertoires/${item.id}/edit`); }}>
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button type="button" aria-label="Ver repertorio" onClick={() => router.push(`/repertoires/${item.id}`)}>
                    <span className="material-symbols-outlined">visibility</span>
                  </button>
                  <button type="button" aria-label="Compartir repertorio">
                    <span className="material-symbols-outlined">share</span>
                  </button>
                </div>
                <button type="button" className="repertoires-delete-button" aria-label="Eliminar repertorio" onClick={(e) => { e.stopPropagation(); void onDelete(item); }}>
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </section>
  );
}

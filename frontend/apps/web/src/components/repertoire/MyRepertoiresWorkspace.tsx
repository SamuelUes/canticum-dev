'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requestDeleterepertoire, requestUserRepertoires } from '../../features/repertoire/clientPersistence';
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
    <section className="repertoires-page-layout layout-h-margin">
      <aside className="repertoires-left-filters" aria-label="Filtros de repertorios">
        <h2>Filtros</h2>

        <div className="repertoires-filter-group">
          <button type="button" className="repertoires-filter-title" aria-label="Tipo litúrgico">
            Tipo Litúrgicos
          </button>
          {liturgicalTypes.map((type) => (
            <label key={type} className="repertoires-check-row">
              <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />
              <span>{type}</span>
            </label>
          ))}
        </div>

        <div className="repertoires-filter-group">
          <button type="button" className="repertoires-filter-title" aria-label="Estado del repertorio">
            Estado
          </button>
          {(['Borrador', 'Publicado'] as repertoireStatus[]).map((status) => (
            <label key={status} className="repertoires-check-row">
              <input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => toggleStatus(status)} />
              <span>{status}</span>
            </label>
          ))}
        </div>

        <div className="repertoires-filter-group">
          <label className="repertoires-select-wrap">
            <span>Ordenar por</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'recent' | 'alpha')}>
              <option value="recent">Más reciente</option>
              <option value="alpha">Alfabético</option>
            </select>
          </label>
        </div>
      </aside>

      <article className="repertoires-main-panel">
        <header className="repertoires-main-head">
          <div>
            <h1>Mis repertorios Litúrgicos</h1>
            <p>Gestiona tus repertorios y abre el detalle de canciones.</p>
          </div>

          <button type="button" className="repertoires-create-button" onClick={() => router.push('/create/repertoires')}>
            + Crear Nuevo repertorio
          </button>
        </header>

        <label className="repertoires-search-wrap" aria-label="Buscar en mis repertorios">
          <input
            type="search"
            placeholder="Buscar en mis repertorios..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {isLoading ? (
          <div className="repertoires-cards-grid" aria-busy aria-label="Cargando repertorios">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="skeleton-pulse repertoires-skeleton-card" />
            ))}
          </div>
        ) : null}

        {!isLoading && filteredItems.length === 0 ? (
          <p className="repertoires-empty-state" style={{ padding: '24px 0', opacity: 0.75 }}>
            Aún no tienes repertorios. Crea uno con el botón &quot;+ Crear Nuevo repertorio&quot;.
          </p>
        ) : null}

        <div className="repertoires-cards-grid" hidden={isLoading}>
          {filteredItems.map((item) => (
            <article key={item.id} className="repertoires-card">
              <header className="repertoires-card-head">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
                <small>Data: {item.dateLabel}</small>
              </header>

              {item.coverImageUrl ? (
                <div className="repertoires-card-image-wrap">
                  <Image
                    src={item.coverImageUrl}
                    alt={`Portada de ${item.title}`}
                    fill
                    className="repertoires-card-image"
                    sizes="(max-width: 768px) 100vw, 320px"
                  />
                </div>
              ) : (
                <div className="repertoires-card-image-wrap is-empty" aria-hidden>
                  <span>Sin imagen</span>
                </div>
              )}

              <div className="repertoires-card-status-row">
                <span className={`repertoires-status-badge ${item.status === 'Publicado' ? 'is-published' : 'is-draft'}`}>{item.status}</span>
                <span className={`repertoires-status-badge ${item.isPublic ? 'is-published' : 'is-draft'}`}>{item.isPublic ? 'Público' : 'Privado'}</span>
              </div>

              <p className="repertoires-card-meta">
                {getSongsCount(item)} canciones, {getSheetsCount(item)} lecturas
              </p>

              <div className="repertoires-card-actions" aria-label="acciones de repertorio">
                <button type="button" aria-label="Editar repertorio" onClick={() => router.push(`/repertoires/${item.id}/edit`)}>
                  <Image src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png" alt="Editar" width={16} height={16} />
                </button>
                <button type="button" aria-label="Ver repertorio" onClick={() => router.push(`/repertoires/${item.id}`)}>
                  <Image src="/assets/utils/iconly_light-outline_document/iconlylightoutlinedocument2x.png" alt="Ver" width={16} height={16} />
                </button>
                <button type="button" aria-label="Compartir repertorio">
                  <Image src="/assets/utils/iconshare-social/iconshare2x.png" alt="Compartir" width={16} height={16} />
                </button>
                <button type="button" aria-label="Eliminar repertorio" onClick={() => void onDelete(item)}>
                  <Image src="/assets/utils/iconly_light-outline_delete/iconlylightoutlinedelete2x.png" alt="Eliminar" width={16} height={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}

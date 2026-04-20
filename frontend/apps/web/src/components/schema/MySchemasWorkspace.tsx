'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { requestDeleteSchema } from '../../features/schema/clientPersistence';
import type { SchemaListItem, SchemaStatus } from '../../types/schema';

interface MySchemasWorkspaceProps {
  items: SchemaListItem[];
}

export function MySchemasWorkspace({ items }: MySchemasWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<SchemaStatus[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'alpha'>('recent');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const liturgicalTypes = useMemo(() => Array.from(new Set(items.map((item) => item.liturgicalType))), [items]);

  const toggleType = (value: string) => {
    setSelectedTypes((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  };

  const toggleStatus = (value: SchemaStatus) => {
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

  const getSongsCount = (item: SchemaListItem): number => {
    if (Array.isArray(item.songIds) && item.songIds.length > 0) {
      return item.songIds.length;
    }

    return item.songsCount;
  };

  const getSheetsCount = (item: SchemaListItem): number => {
    if (Array.isArray(item.songIds) && item.songIds.length > 0) {
      return item.songIds.length;
    }

    return item.sheetsCount;
  };

  const onDelete = async (item: SchemaListItem) => {
    const shouldDelete = window.confirm(`¿Eliminar el esquema \"${item.title}\"?`);
    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleteSchema(item.id);
    if (!result.ok) {
      window.alert('No se pudo eliminar el esquema.');
      return;
    }

    setHiddenIds((prev) => [...prev, item.id]);
  };

  return (
    <section className="schemas-page-layout layout-h-margin">
      <aside className="schemas-left-filters" aria-label="Filtros de esquemas">
        <h2>Filtros</h2>

        <div className="schemas-filter-group">
          <button type="button" className="schemas-filter-title" aria-label="Tipo litúrgico">
            Tipo Litúrgicos
          </button>
          {liturgicalTypes.map((type) => (
            <label key={type} className="schemas-check-row">
              <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />
              <span>{type}</span>
            </label>
          ))}
        </div>

        <div className="schemas-filter-group">
          <button type="button" className="schemas-filter-title" aria-label="Estado del esquema">
            Estado
          </button>
          {(['Borrador', 'Publicado'] as SchemaStatus[]).map((status) => (
            <label key={status} className="schemas-check-row">
              <input type="checkbox" checked={selectedStatuses.includes(status)} onChange={() => toggleStatus(status)} />
              <span>{status}</span>
            </label>
          ))}
        </div>

        <div className="schemas-filter-group">
          <label className="schemas-select-wrap">
            <span>Ordenar por</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'recent' | 'alpha')}>
              <option value="recent">Más reciente</option>
              <option value="alpha">Alfabético</option>
            </select>
          </label>
        </div>
      </aside>

      <article className="schemas-main-panel">
        <header className="schemas-main-head">
          <div>
            <h1>Mis Esquemas Litúrgicos</h1>
            <p>Gestiona tus esquemas y abre el detalle de canciones.</p>
          </div>

          <button type="button" className="schemas-create-button">
            + Crear Nuevo Esquema
          </button>
        </header>

        <label className="schemas-search-wrap" aria-label="Buscar en mis esquemas">
          <input
            type="search"
            placeholder="Buscar en mis esquemas..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="schemas-cards-grid">
          {filteredItems.map((item) => (
            <article key={item.id} className="schemas-card">
              <header className="schemas-card-head">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
                <small>Data: {item.dateLabel}</small>
              </header>

              {item.coverImageUrl ? (
                <div className="schemas-card-image-wrap">
                  <Image src={item.coverImageUrl} alt={item.title} fill className="schemas-card-image" />
                </div>
              ) : (
                <div className="schemas-card-image-wrap is-empty" aria-hidden>
                  <span>Sin imagen</span>
                </div>
              )}

              <div className="schemas-card-status-row">
                <span className={`schemas-status-badge ${item.status === 'Publicado' ? 'is-published' : 'is-draft'}`}>{item.status}</span>
                <span className={`schemas-status-badge ${item.isPublic ? 'is-published' : 'is-draft'}`}>{item.isPublic ? 'Público' : 'Privado'}</span>
              </div>

              <p className="schemas-card-meta">
                {getSongsCount(item)} canciones, {getSheetsCount(item)} lecturas
              </p>

              <div className="schemas-card-actions" aria-label="acciones de esquema">
                <button type="button" aria-label="Editar esquema" onClick={() => router.push(`/schemas/${item.id}/edit`)}>
                  <Image src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png" alt="Editar" width={16} height={16} />
                </button>
                <button type="button" aria-label="Ver esquema" onClick={() => router.push(`/schemas/${item.id}`)}>
                  <Image src="/assets/utils/iconly_light-outline_document/iconlylightoutlinedocument2x.png" alt="Ver" width={16} height={16} />
                </button>
                <button type="button" aria-label="Compartir esquema">
                  <Image src="/assets/utils/iconshare-social/iconshare2x.png" alt="Compartir" width={16} height={16} />
                </button>
                <button type="button" aria-label="Eliminar esquema" onClick={() => void onDelete(item)}>
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

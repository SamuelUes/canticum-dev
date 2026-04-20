'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { requestDeleteSchema } from '../../features/schema/clientPersistence';
import type { SearchAlbumItem, SearchDataset, SearchEntityItem, SearchEntityKind, SearchSchemaItem } from '../../types/search';

const kindLabels: Record<SearchEntityKind, string> = {
  song: 'Canciones',
  album: 'Álbumes',
  schema: 'Esquemas',
  artist: 'Artistas',
  version: 'Versiones'
};

const KIND_ORDER: SearchEntityKind[] = ['song', 'album', 'schema', 'artist', 'version'];

interface SearchExplorerProps {
  initialQuery?: string;
  dataset: SearchDataset;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesQuery(item: SearchEntityItem, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalize(query);
  return normalize(item.searchableText).includes(normalizedQuery) || normalize(item.title).includes(normalizedQuery);
}

export function SearchExplorer({ initialQuery = '', dataset }: SearchExplorerProps) {
  const router = useRouter();
  const currentUserId = 'user-1';
  const [removedSchemaIds, setRemovedSchemaIds] = useState<string[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [selectedKinds, setSelectedKinds] = useState<SearchEntityKind[]>([...KIND_ORDER]);
  const [selectedLiturgicalTypes, setSelectedLiturgicalTypes] = useState<string[]>([]);
  const [selectedLiturgicalTimes, setSelectedLiturgicalTimes] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);

  const visibleItems = useMemo(() => {
    return dataset.items.filter((item) => {
      if (item.kind === 'schema' && removedSchemaIds.includes(item.id)) {
        return false;
      }

      if (item.kind !== 'schema') {
        return true;
      }

      return item.ownerUserId === currentUserId || item.isPublic;
    });
  }, [currentUserId, dataset.items, removedSchemaIds]);

  const filteredItems = useMemo(() => {
    return visibleItems.filter((item) => {
      const byQuery = includesQuery(item, query);
      const byKind = selectedKinds.includes(item.kind);
      const byType = selectedLiturgicalTypes.length === 0 || selectedLiturgicalTypes.includes(item.liturgicalType);
      const byTime = selectedLiturgicalTimes.length === 0 || selectedLiturgicalTimes.includes(item.liturgicalTime);
      const byAuthor = selectedAuthors.length === 0 || selectedAuthors.includes(item.authorOrChoir);
      return byQuery && byKind && byType && byTime && byAuthor;
    });
  }, [query, selectedAuthors, selectedKinds, selectedLiturgicalTimes, selectedLiturgicalTypes, visibleItems]);

  const grouped = useMemo(() => {
    return {
      songs: filteredItems.filter((item) => item.kind === 'song'),
      albums: filteredItems.filter((item): item is SearchAlbumItem => item.kind === 'album'),
      schemas: filteredItems.filter((item): item is SearchSchemaItem => item.kind === 'schema'),
      artists: filteredItems.filter((item) => item.kind === 'artist'),
      versions: filteredItems.filter((item) => item.kind === 'version')
    };
  }, [filteredItems]);

  const toggleGeneric = <T extends string>(value: T, selected: T[], setSelected: (next: T[]) => void) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((item) => item !== value));
      return;
    }

    setSelected([...selected, value]);
  };

  const navigateByItem = (item: SearchEntityItem) => {
    if (item.kind === 'song') {
      router.push(`/songs/${item.songId ?? item.id}`);
      return;
    }

    if (item.kind === 'schema') {
      router.push(`/schemas/${item.schemaId ?? item.id}`);
      return;
    }

    if (item.kind === 'album') {
      router.push(`/albums/${item.albumId ?? item.id}`);
      return;
    }

    if (item.kind === 'artist') {
      router.push(`/artists/${item.artistId ?? item.id}`);
      return;
    }

    router.push(`/songs/${item.songId ?? item.id}`);
  };

  const onEditSchema = (schema: SearchSchemaItem) => {
    router.push(`/schemas/${schema.schemaId ?? schema.id}/edit`);
  };

  const onDeleteSchema = async (schema: SearchSchemaItem) => {
    const shouldDelete = window.confirm(`¿Seguro que quieres eliminar el esquema \"${schema.title}\"?`);

    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleteSchema(schema.schemaId ?? schema.id);

    if (!result.ok) {
      window.alert('No se pudo eliminar el esquema. Verifica permisos o intenta de nuevo.');
      return;
    }

    setRemovedSchemaIds((prev) => [...prev, schema.id]);
  };

  return (
    <section className="search-page-layout layout-h-margin">
      <aside className="search-filter-panel" aria-label="filtros de búsqueda">
        <h2>Filtros</h2>

        <div className="search-filter-group">
          <h3>Mostrar</h3>
          {KIND_ORDER.map((kind) => (
            <label key={kind} className="search-check-row">
              <input type="checkbox" checked={selectedKinds.includes(kind)} onChange={() => toggleGeneric(kind, selectedKinds, setSelectedKinds)} />
              <span>{kindLabels[kind]}</span>
            </label>
          ))}
        </div>

        <div className="search-filter-group">
          <h3>Tipo Litúrgico</h3>
          {dataset.filters.liturgicalTypes.map((type) => (
            <label key={type} className="search-check-row">
              <input
                type="checkbox"
                checked={selectedLiturgicalTypes.includes(type)}
                onChange={() => toggleGeneric(type, selectedLiturgicalTypes, setSelectedLiturgicalTypes)}
              />
              <span>{type}</span>
            </label>
          ))}
        </div>

        <div className="search-filter-group">
          <h3>Tiempo Litúrgico</h3>
          {dataset.filters.liturgicalTimes.map((time) => (
            <label key={time} className="search-check-row">
              <input type="checkbox" checked={selectedLiturgicalTimes.includes(time)} onChange={() => toggleGeneric(time, selectedLiturgicalTimes, setSelectedLiturgicalTimes)} />
              <span>{time}</span>
            </label>
          ))}
        </div>

        <div className="search-filter-group">
          <h3>Autor / Coro</h3>
          {dataset.filters.authorOrChoirs.map((author) => (
            <label key={author} className="search-check-row">
              <input type="checkbox" checked={selectedAuthors.includes(author)} onChange={() => toggleGeneric(author, selectedAuthors, setSelectedAuthors)} />
              <span>{author}</span>
            </label>
          ))}
        </div>
      </aside>

      <article className="search-results-panel">
        <header className="search-results-head">
          <h1>Gestión de Búsqueda</h1>
          <label className="search-page-input-wrap" aria-label="buscar canciones, álbumes, esquemas, artistas y versiones">
            <input
              className="search-page-input"
              type="search"
              placeholder="Buscar canciones, álbumes, esquemas, artistas o versiones"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>

        <div className="search-type-chips" aria-label="conteo de resultados">
          <span>{grouped.songs.length} Canciones</span>
          <span>{grouped.albums.length} Álbumes</span>
          <span>{grouped.schemas.length} Esquemas</span>
          <span>{grouped.artists.length} Artistas</span>
          <span>{grouped.versions.length} Versiones</span>
        </div>

        <section className="search-results-section">
          <h2>Canciones</h2>
          <div className="search-generic-grid">
            {grouped.songs.map((item) => (
              <button key={item.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(item)}>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="search-results-section">
          <h2>Álbumes</h2>
          <div className="search-generic-grid">
            {grouped.albums.map((album) => (
              <button key={album.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(album)}>
                <strong>{album.title}</strong>
                <small>{album.artistName} · {album.albumType}{album.releaseYear ? ` · ${album.releaseYear}` : ''}</small>
                <small>{album.totalTracks} Canciones</small>
              </button>
            ))}
          </div>
        </section>

        <section className="search-results-section">
          <h2>Esquemas</h2>
          <div className="search-schema-grid">
            {grouped.schemas.map((schema) => (
              <button key={schema.id} type="button" className="search-schema-card search-clickable-card" onClick={() => navigateByItem(schema)}>
                <div>
                  <strong>{schema.title}</strong>
                  <small>Fecha: {schema.dateLabel}</small>
                  <small>{schema.ownerUserId === currentUserId ? 'Tu esquema' : schema.isPublic ? 'Esquema público' : 'Esquema privado'}</small>
                </div>

                <div className="search-schema-structure">
                  <span>Estructura</span>
                  <small>Total Canciones: {schema.songsCount}</small>
                  <small>Partituras: {schema.sheetsCount}</small>
                </div>

                <div className="search-schema-actions" aria-label="acciones de esquema">
                  <button type="button" aria-label="Guardar esquema" onClick={(event) => event.stopPropagation()}>
                    <Image src="/assets/utils/iconly_light-outline_bookmark/iconlylightoutlinebookmark2x.png" alt="Guardar" width={14} height={14} />
                  </button>
                  {schema.ownerUserId === currentUserId ? (
                    <>
                      <button
                        type="button"
                        aria-label="Editar esquema"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditSchema(schema);
                        }}
                      >
                        <Image src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png" alt="Editar" width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar esquema"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteSchema(schema);
                        }}
                      >
                        <Image src="/assets/utils/iconly_light-outline_delete/iconlylightoutlinedelete2x.png" alt="Eliminar" width={14} height={14} />
                      </button>
                    </>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="search-results-section">
          <h2>Artistas y Versiones</h2>
          <div className="search-generic-grid">
            {grouped.artists.map((item) => (
              <button key={item.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(item)}>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </button>
            ))}

            {grouped.versions.map((item) => (
              <button key={item.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(item)}>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </button>
            ))}
          </div>
        </section>
      </article>
    </section>
  );
}

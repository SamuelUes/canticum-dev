'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { getArtistProfileHref } from '../../features/artist/routing';
import { getCachedSearchDatasetClient, getClientCurrentUserId, getSearchDatasetClient } from '../../features/search/repository';
import { requestDeleterepertoire } from '../../features/repertoire/clientPersistence';
import type { SearchAlbumItem, SearchDataset, SearchEntityItem, SearchEntityKind, SearchrepertoireItem } from '../../types/search';

const kindLabels: Record<SearchEntityKind, string> = {
  song: 'Canciones',
  album: 'Álbumes',
  repertoire: 'Repertorios',
  artist: 'Artistas',
  version: 'Versiones'
};

const KIND_ORDER: SearchEntityKind[] = ['song', 'album', 'repertoire', 'artist', 'version'];

interface SearchExplorerProps {
  initialQuery?: string;
  initialCategory?: string;
  /** Optional initial dataset (e.g. SSR). When omitted, the explorer renders a skeleton until the client fetch resolves. */
  dataset?: SearchDataset;
}

const EMPTY_DATASET: SearchDataset = {
  filters: { liturgicalTypes: [], liturgicalTimes: [], authorOrChoirs: [], categories: [] },
  items: []
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseKindsFromQuery(rawKinds: string | null): SearchEntityKind[] {
  if (!rawKinds) {
    return [...KIND_ORDER];
  }

  const parsedKinds = rawKinds
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is SearchEntityKind => KIND_ORDER.includes(item as SearchEntityKind));

  if (parsedKinds.length === 0) {
    return [...KIND_ORDER];
  }

  return Array.from(new Set(parsedKinds));
}

function areKindsEqual(left: SearchEntityKind[], right: SearchEntityKind[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((kind) => right.includes(kind));
}

function includesQuery(item: SearchEntityItem, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalize(query);
  return normalize(item.searchableText).includes(normalizedQuery) || normalize(item.title).includes(normalizedQuery);
}

function resolveArtistName(item: SearchEntityItem): string {
  const title = item.title.trim();
  const fallback = item.authorOrChoir.trim();

  if (!title) {
    return fallback || 'Artista';
  }

  if (title.toLowerCase() === 'artista' && fallback) {
    return fallback;
  }

  return title;
}

function resolveArtistSubtitle(item: SearchEntityItem): string {
  const subtitle = item.subtitle.trim();
  if (!subtitle || subtitle.toLowerCase() === 'unknown') {
    return 'General';
  }
  return subtitle;
}

export function SearchExplorer({ initialQuery = '', initialCategory = 'todos', dataset }: SearchExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cachedDataset = useMemo(() => dataset ?? getCachedSearchDatasetClient('catalog') ?? EMPTY_DATASET, [dataset]);
  const selectedKindsFromQuery = useMemo(() => parseKindsFromQuery(searchParams.get('kinds')), [searchParams]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeDataset, setActiveDataset] = useState<SearchDataset>(cachedDataset);
  const [isLoading, setIsLoading] = useState<boolean>(cachedDataset === EMPTY_DATASET);
  const [removedRepertoireIds, setRemovedRepertoireIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(initialQuery);
  const [selectedKinds, setSelectedKinds] = useState<SearchEntityKind[]>(selectedKindsFromQuery);
  const [selectedLiturgicalTypes, setSelectedLiturgicalTypes] = useState<string[]>([]);
  const [selectedLiturgicalTimes, setSelectedLiturgicalTimes] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);

  useEffect(() => {
    setSelectedKinds(selectedKindsFromQuery);
  }, [selectedKindsFromQuery]);

  useEffect(() => {
    const currentKinds = parseKindsFromQuery(searchParams.get('kinds'));
    if (areKindsEqual(currentKinds, selectedKinds)) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    if (selectedKinds.length === KIND_ORDER.length) {
      nextParams.delete('kinds');
    } else {
      nextParams.set('kinds', selectedKinds.join(','));
    }

    const queryString = nextParams.toString();
    router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
  }, [router, searchParams, selectedKinds]);

  useEffect(() => {
    let disposed = false;
    const normalizedCategory = initialCategory.trim().toLowerCase();
    const categoryParam = !normalizedCategory || normalizedCategory === 'todos' ? '' : normalizedCategory;

    const hydrate = async () => {
      try {
        const [resolvedUserId, resolvedDataset] = await Promise.all([
          getClientCurrentUserId(),
          getSearchDatasetClient({ scope: 'catalog', category: categoryParam })
        ]);

        if (disposed) {
          return;
        }

        setCurrentUserId(resolvedUserId);
        setActiveDataset(resolvedDataset);
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
  }, [initialCategory]);

  const visibleItems = useMemo(() => {
    return activeDataset.items.filter((item) => {
      if (item.kind === 'repertoire' && removedRepertoireIds.has(item.id)) {
        return false;
      }

      if (item.kind !== 'repertoire') {
        return true;
      }

      return item.ownerUserId === currentUserId || item.isPublic;
    });
  }, [activeDataset.items, currentUserId, removedRepertoireIds]);

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
      repertoires: filteredItems.filter((item): item is SearchrepertoireItem => item.kind === 'repertoire'),
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

    if (item.kind === 'repertoire') {
      router.push(`/repertoires/${item.repertoireId ?? item.id}`);
      return;
    }

    if (item.kind === 'album') {
      router.push(`/albums/${item.albumId ?? item.id}`);
      return;
    }

    if (item.kind === 'artist') {
      const artistName = resolveArtistName(item);
      router.push(
        getArtistProfileHref({
          artistId: item.artistId ?? item.id,
          artistName: artistName
        })
      );
      return;
    }

    router.push(`/songs/${item.songId ?? item.id}`);
  };

  const onEditrepertoire = (repertoire: SearchrepertoireItem) => {
    router.push(`/repertoires/${repertoire.repertoireId ?? repertoire.id}/edit`);
  };

  const onDeleterepertoire = async (repertoire: SearchrepertoireItem) => {
    const shouldDelete = window.confirm(`¿Seguro que quieres eliminar el repertorio \"${repertoire.title}\"?`);

    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleterepertoire(repertoire.repertoireId ?? repertoire.id);

    if (!result.ok) {
      window.alert('No se pudo eliminar el repertorio. Verifica permisos o intenta de nuevo.');
      return;
    }

    setRemovedRepertoireIds((prev) => {
      const next = new Set(prev);
      next.add(repertoire.id);
      return next;
    });
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
          {activeDataset.filters.liturgicalTypes.map((type) => (
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
          {activeDataset.filters.liturgicalTimes.map((time) => (
            <label key={time} className="search-check-row">
              <input type="checkbox" checked={selectedLiturgicalTimes.includes(time)} onChange={() => toggleGeneric(time, selectedLiturgicalTimes, setSelectedLiturgicalTimes)} />
              <span>{time}</span>
            </label>
          ))}
        </div>

        <div className="search-filter-group">
          <h3>Autor / Coro</h3>
          {activeDataset.filters.authorOrChoirs.map((author) => (
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
          <label className="search-page-input-wrap" aria-label="buscar canciones, álbumes, Repertorios, artistas y versiones">
            <input
              className="search-page-input"
              type="search"
              placeholder="Buscar canciones, álbumes, Repertorios, artistas o versiones"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>

        {!isLoading ? (
          <div className="search-type-chips" aria-label="conteo de resultados">
            <span>{grouped.songs.length} Canciones</span>
            <span>{grouped.albums.length} Álbumes</span>
            <span>{grouped.repertoires.length} Repertorios</span>
            <span>{grouped.artists.length} Artistas</span>
            <span>{grouped.versions.length} Versiones</span>
          </div>
        ) : null}

        {isLoading ? (
          <div aria-busy aria-label="Cargando resultados">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="search-results-section">
                <Skeleton height={26} width={180} />
                <Skeleton height={120} />
              </div>
            ))}
          </div>
        ) : null}

        <section className="search-results-section" hidden={isLoading || !selectedKinds.includes('song')}>
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

        <section className="search-results-section" hidden={isLoading || !selectedKinds.includes('album')}>
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

        <section className="search-results-section" hidden={isLoading || !selectedKinds.includes('repertoire')}>
          <h2>Repertorios</h2>
          <div className="search-repertoire-grid">
            {grouped.repertoires.map((repertoire) => (
              <button key={repertoire.id} type="button" className="search-repertoire-card search-clickable-card" onClick={() => navigateByItem(repertoire)}>
                <div>
                  <strong>{repertoire.title}</strong>
                  <small>Fecha: {repertoire.dateLabel}</small>
                  <small>{repertoire.ownerUserId === currentUserId ? 'Tu repertorio' : repertoire.isPublic ? 'repertorio público' : 'repertorio privado'}</small>
                </div>

                <div className="search-repertoire-structure">
                  <span>Estructura</span>
                  <small>Total Canciones: {repertoire.songsCount}</small>
                  <small>Partituras: {repertoire.sheetsCount}</small>
                </div>

                <div className="search-repertoire-actions" aria-label="acciones de repertorio">
                  <button type="button" aria-label="Guardar repertorio" onClick={(event) => event.stopPropagation()}>
                    <Image src="/assets/utils/iconly_light-outline_bookmark/iconlylightoutlinebookmark2x.png" alt="Guardar" width={14} height={14} />
                  </button>
                  {repertoire.ownerUserId === currentUserId ? (
                    <>
                      <button
                        type="button"
                        aria-label="Editar repertorio"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditrepertoire(repertoire);
                        }}
                      >
                        <Image src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png" alt="Editar" width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar repertorio"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleterepertoire(repertoire);
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

        <section className="search-results-section" hidden={isLoading || !selectedKinds.includes('artist')}>
          <h2>Artistas</h2>
          <div className="search-generic-grid">
            {grouped.artists.length > 0
              ? grouped.artists.map((item) => (
                  <button key={item.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(item)}>
                    <strong>{resolveArtistName(item)}</strong>
                    <small>{resolveArtistSubtitle(item)}</small>
                  </button>
                ))
              : <p className="search-empty-state">Sin artistas</p>}
          </div>
        </section>

        <section className="search-results-section" hidden={isLoading || !selectedKinds.includes('version')}>
          <h2>Versiones</h2>
          <div className="search-generic-grid">
            {grouped.versions.length > 0
              ? grouped.versions.map((item) => (
                  <button key={item.id} type="button" className="search-generic-card search-clickable-card" onClick={() => navigateByItem(item)}>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </button>
                ))
              : <p className="search-empty-state">Sin versiones</p>}
          </div>
        </section>
      </article>
    </section>
  );
}

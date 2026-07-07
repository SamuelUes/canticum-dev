'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArtistProfileHref } from '../../features/artist/routing';
import { getClientCurrentUserId, getSearchDatasetClient } from '../../features/search/repository';
import { requestDeleterepertoire, loadRepertoireBookmark, saveRepertoireBookmark } from '../../features/repertoire/clientPersistence';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';
import { SkeletonCard, SkeletonTitle } from '../ui/skeleton';
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

export function SearchExplorer({ initialQuery = '', initialCategory = 'todos', dataset }: SearchExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cachedDataset = useMemo(() => dataset ?? EMPTY_DATASET, [dataset]);
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
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileSidebarUi, setIsMobileSidebarUi] = useState(false);
  const [sidebarDragOffset, setSidebarDragOffset] = useState(0);
  const [bookmarkedRepertoires, setBookmarkedRepertoires] = useState<Set<string>>(new Set());
  const sidebarDragStartRef = useRef<number | null>(null);

  // Lock body scroll when sidebar is expanded on mobile
  useEffect(() => {
    if (isSidebarExpanded) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isSidebarExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsMobileSidebarUi(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isSidebarExpanded) {
      setSidebarDragOffset(0);
      sidebarDragStartRef.current = null;
    }
  }, [isSidebarExpanded]);

  const handleSidebarDragStart = useCallback((clientY: number, target: EventTarget | null) => {
    if (!isMobileSidebarUi) {
      return;
    }

    const element = target instanceof HTMLElement ? target : null;
    if (element?.closest('.search-page__sidebar-close')) {
      return;
    }

    sidebarDragStartRef.current = clientY;
  }, [isMobileSidebarUi]);

  const handleSidebarDragMove = useCallback((clientY: number) => {
    if (!isMobileSidebarUi || sidebarDragStartRef.current === null) {
      return;
    }

    const delta = clientY - sidebarDragStartRef.current;
    setSidebarDragOffset(delta > 0 ? delta : 0);
  }, [isMobileSidebarUi]);

  const handleSidebarDragEnd = useCallback(() => {
    if (!isMobileSidebarUi || sidebarDragStartRef.current === null) {
      return;
    }

    sidebarDragStartRef.current = null;
    setSidebarDragOffset((current) => {
      if (current > 110) {
        setIsSidebarExpanded(false);
      }
      return 0;
    });
  }, [isMobileSidebarUi]);

  const sidebarStyle = isMobileSidebarUi && isSidebarExpanded && sidebarDragOffset > 0
    ? { transform: `translateY(${sidebarDragOffset}px)` }
    : undefined;

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
    const controller = new AbortController();
    const normalizedCategory = initialCategory.trim().toLowerCase();
    const categoryParam = !normalizedCategory || normalizedCategory === 'todos' ? '' : normalizedCategory;

    const hydrate = async () => {
      try {
        const [resolvedUserId, resolvedDataset] = await Promise.all([
          getClientCurrentUserId(),
          getSearchDatasetClient({ scope: 'catalog', category: categoryParam, signal: controller.signal })
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
      controller.abort();
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

  // Load bookmark states for visible repertoires
  useEffect(() => {
    const repertoireIds = visibleItems
      .filter((item) => item.kind === 'repertoire')
      .map((item) => item.id);

    if (repertoireIds.length === 0 || !currentUserId) {
      return;
    }

    repertoireIds.forEach((repertoireId) => {
      void loadRepertoireBookmark(repertoireId).then((isBookmarked) => {
        if (typeof isBookmarked === 'boolean') {
          setBookmarkedRepertoires((prev) => {
            const next = new Set(prev);
            if (isBookmarked) {
              next.add(repertoireId);
            } else {
              next.delete(repertoireId);
            }
            return next;
          });
        }
      });
    });
  }, [visibleItems, currentUserId]);

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
    <section className={`search-page ${isSidebarExpanded ? 'is-sidebar-expanded' : ''}`}>
      {/* Mobile backdrop */}
      {isSidebarExpanded && (
        <div
          className="search-page__backdrop is-visible"
          onClick={() => setIsSidebarExpanded(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`search-page__sidebar ${isSidebarExpanded ? 'is-expanded' : ''}${sidebarDragOffset > 0 ? ' is-dragging' : ''}`} aria-label="filtros de búsqueda" style={sidebarStyle}>
        <div
          className="search-page__sidebar-header"
          onPointerDown={(event) => handleSidebarDragStart(event.clientY, event.target)}
          onPointerDownCapture={(event) => {
            if (isMobileSidebarUi) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => handleSidebarDragMove(event.clientY)}
          onPointerUp={handleSidebarDragEnd}
          onPointerCancel={handleSidebarDragEnd}
        >
          <h2 className="search-page__sidebar-title">
            <span className="material-symbols-outlined" aria-hidden="true">filter_list</span>
            Filtros
          </h2>
          <button
            type="button"
            className="search-page__sidebar-close"
            onClick={() => setIsSidebarExpanded(false)}
            aria-label="Cerrar filtros"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="search-page__filter-group">
          <h3 className="search-page__filter-label">Mostrar</h3>
          {KIND_ORDER.map((kind) => (
            <label key={kind} className="search-page__filter-row">
              <input type="checkbox" checked={selectedKinds.includes(kind)} onChange={() => toggleGeneric(kind, selectedKinds, setSelectedKinds)} />
              <span>{kindLabels[kind]}</span>
            </label>
          ))}

          <h3 className="search-page__filter-label">Tipo Litúrgico</h3>
          {activeDataset.filters.liturgicalTypes.map((type) => (
            <label key={type} className="search-page__filter-row">
              <input
                type="checkbox"
                checked={selectedLiturgicalTypes.includes(type)}
                onChange={() => toggleGeneric(type, selectedLiturgicalTypes, setSelectedLiturgicalTypes)}
              />
              <span>{type}</span>
            </label>
          ))}

          <h3 className="search-page__filter-label">Tiempo Litúrgico</h3>
          {activeDataset.filters.liturgicalTimes.map((time) => (
            <label key={time} className="search-page__filter-row">
              <input type="checkbox" checked={selectedLiturgicalTimes.includes(time)} onChange={() => toggleGeneric(time, selectedLiturgicalTimes, setSelectedLiturgicalTimes)} />
              <span>{time}</span>
            </label>
          ))}

          <h3 className="search-page__filter-label">Autor / Coro</h3>
          {activeDataset.filters.authorOrChoirs.map((author) => (
            <label key={author} className="search-page__filter-row">
              <input type="checkbox" checked={selectedAuthors.includes(author)} onChange={() => toggleGeneric(author, selectedAuthors, setSelectedAuthors)} />
              <span>{author}</span>
            </label>
          ))}
        </div>
      </aside>

      <main className="search-page__content">
        <header className="search-page__header">
          <div className="search-page__header-top">
            <h1 className="search-page__title">Gestión de Búsqueda</h1>
            <button
              type="button"
              className="search-page__mobile-filter-toggle"
              onClick={() => setIsSidebarExpanded(true)}
              aria-label="Abrir filtros"
            >
              <span className="material-symbols-outlined">filter_list</span>
              Filtros
            </button>
          </div>
          <div className="search-page__search-bar" aria-label="buscar canciones, álbumes, Repertorios, artistas y versiones">
            <span className="material-symbols-outlined search-page__search-icon" aria-hidden="true">search</span>
            <input
              className="search-page__search-input"
              type="search"
              placeholder="Buscar canciones, álbumes, Repertorios, artistas o versiones"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="button" className="search-page__search-btn">Buscar</button>
          </div>
        </header>

        {!isLoading ? (
          <div className="search-page__chips" aria-label="conteo de resultados">
            <span className={`search-page__chip ${selectedKinds.includes('song') ? 'is-active' : ''}`}>{grouped.songs.length} Canciones</span>
            <span className={`search-page__chip ${selectedKinds.includes('album') ? 'is-active' : ''}`}>{grouped.albums.length} Álbumes</span>
            <span className={`search-page__chip ${selectedKinds.includes('repertoire') ? 'is-active' : ''}`}>{grouped.repertoires.length} Repertorios</span>
            <span className={`search-page__chip ${selectedKinds.includes('artist') ? 'is-active' : ''}`}>{grouped.artists.length} Artistas</span>
            <span className={`search-page__chip ${selectedKinds.includes('version') ? 'is-active' : ''}`}>{grouped.versions.length} Versiones</span>
          </div>
        ) : null}

        {isLoading ? (
          <div aria-busy aria-label="Cargando resultados">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="search-page__section">
                <SkeletonTitle />
                <SkeletonCard className="search-page__skeleton-card" />
              </div>
            ))}
          </div>
        ) : null}

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('song')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <p>♪</p>
              Canciones
            </h2>
            <a href="#" className="search-page__section-link">Ver todas</a>
          </div>
          <div className="search-page__song-grid">
            {grouped.songs.map((item, index) => (
              <button key={item.id} type="button" role="button" className="search-page__song-card" onClick={() => navigateByItem(item)}>
                <div className="search-page__song-cover">
                  {item.images && item.images.length > 0 ? (
                    <Image src={item.images[0].url} alt={item.title} width={48} height={48} priority={index === 0} />
                  ) : (
                    <div className="search-page__song-cover">
                      <span className="material-symbols-outlined" aria-hidden="true">music_note</span>
                    </div>
                  )}
                </div>
                <div className="search-page__song-content">
                  <strong role="button">{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('album')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">album</span>
              Álbumes
            </h2>
          </div>
          <div className="search-page__album-grid">
            {grouped.albums.map((album, index) => (
              <button key={album.id} type="button" className="search-page__album-card" onClick={() => navigateByItem(album)}>
                <div className="search-page__album-cover">
                  {album.images && album.images.length > 0 ? (
                    <Image src={album.images[0].url} alt={album.title} width={200} height={200} priority={index === 0} />
                  ) : (
                    <span className="material-symbols-outlined search-page__album-placeholder" aria-hidden="true">album</span>
                  )}
                </div>
                <div className="search-page__album-content">
                  <strong>{album.title}</strong>
                  <small>{album.artistName}</small>
                  <small className="search-page__album-badge"> Canciones {album.totalTracks}</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('repertoire')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">description</span>
              Repertorios
            </h2>
          </div>
          <div className="search-page__repertoire-list">
            {grouped.repertoires.map((repertoire, index) => (
              <div key={repertoire.id} role="button" tabIndex={0} className="search-page__repertoire-card" onClick={() => navigateByItem(repertoire)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateByItem(repertoire); } }}>
                <div className={`search-page__repertoire-left-border ${repertoire.ownerUserId === currentUserId ? 'is-own' : ''}`}></div>
                <div className="search-page__repertoire-cover">
                  {repertoire.images && repertoire.images.length > 0 ? (
                    <Image src={repertoire.images[0].url} alt={`Portada de ${repertoire.title}`} width={64} height={64} priority={index === 0} />
                  ) : null}
                </div>
                <div className="search-page__repertoire-main">
                  <div className="search-page__repertoire-header">
                    <strong>{repertoire.title}</strong>
                    <span className={`search-page__repertoire-badge ${repertoire.ownerUserId === currentUserId ? 'is-own' : 'is-public'}`}>
                      {repertoire.ownerUserId === currentUserId ? 'TU REPERTORIO' : repertoire.isPublic ? 'PÚBLICO' : 'PRIVADO'}
                    </span>
                  </div>
                  <small className="search-page__repertoire-date">Fecha: {repertoire.dateLabel}</small>
                </div>

                <div className="search-page__repertoire-stats">
                  <div className="search-page__repertoire-stat">
                    <span className="search-page__repertoire-stat-value">{repertoire.songsCount}</span>
                    <span className="search-page__repertoire-stat-label">Canciones</span>
                  </div>
                  <div className="search-page__repertoire-stat">
                    <span className="search-page__repertoire-stat-value">{repertoire.sheetsCount}</span>
                    <span className="search-page__repertoire-stat-label">Partituras</span>
                  </div>
                </div>

                <div className="search-page__repertoire-actions" aria-label="acciones de repertorio">
                  <button
                    type="button"
                    className={bookmarkedRepertoires.has(repertoire.id) ? 'is-bookmarked' : ''}
                    aria-label={bookmarkedRepertoires.has(repertoire.id) ? 'Quitar de guardados' : 'Guardar repertorio'}
                    onClick={(event) => void toggleBookmark(repertoire.id, event)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {bookmarkedRepertoires.has(repertoire.id) ? 'bookmark_added' : 'bookmark'}
                    </span>
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
                        <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar repertorio"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleterepertoire(repertoire);
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('artist')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              <span className="material-symbols-outlined" aria-hidden="true">person</span>
              Artistas
            </h2>
            <a href="#" className="search-page__section-link">Ver todas</a>
          </div>
          <HorizontalConveyor ariaLabel="Artistas" className="artists-conveyor" scrollStep={260}>
            <div className="artists-track">
            {grouped.artists.length > 0
              ? grouped.artists.map((item, index) => (
                  <button key={item.id} type="button" className="artist-home-pill artist-card-interactive" onClick={() => navigateByItem(item)}>
                    {item.images && item.images.length > 0 ? (
                      <Image
                        src={item.images[0].url}
                        alt={resolveArtistName(item)}
                        className="artist-avatar-image"
                        width={62}
                        height={62}
                        priority={index === 0}
                      />
                    ) : (
                      <div className="artist-avatar">
                        <span className="material-symbols-outlined placeholder-icon-artist-section" aria-hidden="true">person</span>
                      </div>
                    )}
                    <small className="artist-name">{resolveArtistName(item)}</small>
                  </button>
                ))
              : <p className="search-empty-state">Sin artistas</p>}
            </div>
          </HorizontalConveyor>
        </section>

        <section className="search-page__section" hidden={isLoading || !selectedKinds.includes('version')}>
          <div className="search-page__section-header">
            <h2 className="search-page__section-title">
              {/* <Image src="/assets/utils/file-text/filetext2x.png" alt="" width={24} height={24} /> */}
              ᯓ♪
              Versiones
            </h2>
          </div>
          <div className="search-page__version-grid">
            {grouped.versions.length > 0
              ? grouped.versions.map((item) => (
                  <button key={item.id} type="button" className="search-page__version-card" onClick={() => navigateByItem(item)}>
                    <strong>{item.title}</strong>
                    <span className="search-page__version-tag">{item.instrument}</span>
                    <div className="search-page__version-meta">
                      <small>{item.subtitle}</small>
                    </div>
                  </button>
                ))
              : <p className="search-empty-state">Sin versiones</p>}
          </div>
        </section>
      </main>
    </section>
  );
}

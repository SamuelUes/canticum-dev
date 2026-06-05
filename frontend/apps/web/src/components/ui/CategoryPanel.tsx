'use client';

import Skeleton from 'react-loading-skeleton';

interface CategoryPanelProps {
  selectedCategory: string;
  categoryOptions: string[];
  loading: boolean;
  mobile: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSelectCategory: (category: string) => void;
  onClose: () => void;
}

function formatCategoryLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, ' ');
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CategoryPanel({
  selectedCategory,
  categoryOptions,
  loading,
  mobile,
  searchTerm,
  onSearchTermChange,
  onSelectCategory,
  onClose
}: CategoryPanelProps) {
  const normalized = categoryOptions
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== 'todos');

  const shortcuts = ['todos'].concat(Array.from(new Set(normalized)).slice(0, 4));
  const extra = Array.from(
    new Set(
      normalized.filter((value) => !shortcuts.includes(value))
    )
  );
  const filtered = extra.filter((value) => {
    if (!searchTerm.trim()) return true;
    return value.includes(searchTerm.trim().toLowerCase());
  });

  const panel = (
    <div className={`header-categories-panel${mobile ? ' is-mobile' : ''}`} role="dialog" aria-label="Más categorías">
      {mobile ? (
        <div className="header-categories-panel-top">
          <span className="header-categories-grabber" aria-hidden />
          <h4 className="header-categories-title">Más</h4>
        </div>
      ) : null}

      <input
        type="search"
        className="header-categories-search"
        aria-label="Buscar categoría"
        placeholder="Buscar"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
      />

      <div className="header-categories-list" role="listbox" aria-label="Listado de categorías">
        {loading ? (
          Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={`category-list-skeleton-${index}`} height={30} borderRadius={10} className="header-categories-list-skeleton" />
          ))
        ) : filtered.length > 0 ? (
          filtered.map((category) => (
            <button
              key={category}
              type="button"
              className={`header-categories-list-item${selectedCategory === category ? ' is-active' : ''}`}
              onClick={() => {
                onSelectCategory(category);
                onClose();
              }}
            >
              {formatCategoryLabel(category)}
            </button>
          ))
        ) : (
          <p className="header-categories-empty">No hay categorías para ese filtro.</p>
        )}
      </div>
    </div>
  );

  return mobile ? (
    <>
      <button type="button" className="header-categories-backdrop" onClick={onClose} aria-label="Cerrar panel de categorías" />
      {panel}
    </>
  ) : (
    <div className="header-categories-more is-open">{panel}</div>
  );
}

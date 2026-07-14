'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSearchDatasetClient } from '../../features/search/repository';
import { CategoryPanel } from '../ui/CategoryPanel';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';

interface NavProps {
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
  categoryOptions?: string[];
}

function formatCategoryLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, ' ');
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Nav({
  selectedCategory = 'todos',
  onCategoryChange,
  categoryOptions
}: NavProps) {
  const stableCategoryOptions = useMemo(() => categoryOptions ?? [], [categoryOptions]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [internalCategoryOptions, setInternalCategoryOptions] = useState<string[]>([]);
  const [loadingInternalCategories, setLoadingInternalCategories] = useState(false);
  const [isMobileCategoriesUi, setIsMobileCategoriesUi] = useState(false);
  const [visibleShortcutCount, setVisibleShortcutCount] = useState(4);
  const router = useRouter();
  const categoriesMenuRef = useRef<HTMLDivElement>(null);

  const applyCategoryChange = (category: string) => {
    const normalized = category.trim().toLowerCase();
    if (onCategoryChange) onCategoryChange(normalized);

    const nextPath = normalized && normalized !== 'todos'
      ? `/search?category=${encodeURIComponent(normalized)}`
      : '/search';
    router.push(nextPath);
  };

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (categoriesMenuRef.current && !categoriesMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    setCategorySearchTerm('');
  }, [selectedCategory]);

  useEffect(() => {
    if (stableCategoryOptions.length > 0) {
      const normalizedProvided = stableCategoryOptions
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0 && value !== 'todos');
      setInternalCategoryOptions(Array.from(new Set(normalizedProvided)));
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const hydrate = async () => {
      setLoadingInternalCategories(true);
      try {
        const dataset = await getSearchDatasetClient({ scope: 'catalog', signal: controller.signal });
        if (disposed) return;
        const normalized = dataset.filters.categories
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0);
        setInternalCategoryOptions(Array.from(new Set(normalized)));
      } finally {
        if (!disposed) {
          setLoadingInternalCategories(false);
        }
      }
    };

    void hydrate();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [stableCategoryOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobileCategoriesUi(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const breakpoints = [
      { query: '(max-width: 480px)', count: 3 },
      { query: '(max-width: 768px)', count: 4 },
      { query: '(max-width: 1024px)', count: 5 },
    ];

    const mediaQueries = breakpoints.map(({ query, count }) => ({
      media: window.matchMedia(query),
      count,
    }));

    const sync = () => {
      let count = 6;
      for (const { media, count: mediaCount } of mediaQueries) {
        if (media.matches) {
          count = mediaCount;
          break;
        }
      }
      setVisibleShortcutCount(count);
    };

    sync();
    mediaQueries.forEach(({ media }) => media.addEventListener('change', sync));
    return () => mediaQueries.forEach(({ media }) => media.removeEventListener('change', sync));
  }, []);

  useEffect(() => {
    if (!isMoreMenuOpen || !isMobileCategoriesUi || typeof document === 'undefined') {
      return;
    }

    document.body.classList.add('body-overflow-hidden');
    return () => {
      document.body.classList.remove('body-overflow-hidden');
    };
  }, [isMoreMenuOpen, isMobileCategoriesUi]);

  const normalizedCategoryOptions = (stableCategoryOptions.length > 0 ? stableCategoryOptions : internalCategoryOptions)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== 'todos');
  const categoryShortcuts = ['todos'].concat(Array.from(new Set(normalizedCategoryOptions)).slice(0, visibleShortcutCount - 1));

  return (
    <nav className="header-categories home-nav layout-h-margin" aria-label="Filtros por categoría" ref={categoriesMenuRef}>
      <div className="header-categories-row">
        <HorizontalConveyor
          ariaLabel="Categorías principales"
          className="header-categories-conveyor"
        >
          <div className="header-categories-shortcuts" role="list" aria-label="Categorías principales">
            {categoryShortcuts.map((category) => (
              <button
                key={category}
                type="button"
                role="listitem"
                className={`header-category-chip${selectedCategory === category ? ' is-active' : ''}`}
                onClick={() => applyCategoryChange(category)}
              >
                {category === 'todos' ? 'Todos' : formatCategoryLabel(category)}
              </button>
            ))}
          </div>
        </HorizontalConveyor>
        <button
          type="button"
          className={`header-category-chip header-category-chip-more${isMoreMenuOpen ? ' is-active' : ''}`}
          onClick={() => setIsMoreMenuOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isMoreMenuOpen}
        >
          Más <span className="material-symbols-outlined header-icon">keyboard_arrow_down</span>
        </button>
      </div>

      {isMoreMenuOpen ? (
        <CategoryPanel
          selectedCategory={selectedCategory}
          categoryOptions={stableCategoryOptions.length > 0 ? stableCategoryOptions : internalCategoryOptions}
          loading={loadingInternalCategories}
          mobile={isMobileCategoriesUi}
          searchTerm={categorySearchTerm}
          onSearchTermChange={setCategorySearchTerm}
          onSelectCategory={applyCategoryChange}
          onClose={() => setIsMoreMenuOpen(false)}
        />
      ) : null}
    </nav>
  );
}

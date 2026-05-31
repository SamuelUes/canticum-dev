'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { useAuth } from '../../context/AuthContext';
import { getSearchDatasetClient } from '../../features/search/repository';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import type { HomeText } from '../../types/home';
import { CreateMenu } from '../ui/CreateMenu';
import { HorizontalConveyor } from '../ui/HorizontalConveyor';

interface HeaderProps {
  text: HomeText;
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
  categoryOptions?: string[];
  showCategories?: boolean;
}



function formatCategoryLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, ' ');
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Header({
  text,
  selectedCategory = 'todos',
  onCategoryChange,
  categoryOptions = [],
  showCategories = false
}: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [internalCategoryOptions, setInternalCategoryOptions] = useState<string[]>([]);
  const [loadingInternalCategories, setLoadingInternalCategories] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileCategoriesUi, setIsMobileCategoriesUi] = useState(false);
  const [isMorePanelDragging, setIsMorePanelDragging] = useState(false);
  const [morePanelOffsetY, setMorePanelOffsetY] = useState(0);
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { openPremiumPlans } = usePremiumNavigation();
  const menuRef = useRef<HTMLDivElement>(null);
  const categoriesMenuRef = useRef<HTMLDivElement>(null);
  const morePanelPointerStartYRef = useRef(0);
  const morePanelStartOffsetYRef = useRef(0);
  const morePanelOffsetYRef = useRef(0);

  const applyCategoryChange = (category: string) => {
    const normalized = category.trim().toLowerCase();
    if (onCategoryChange) onCategoryChange(normalized);

    if (showCategories) {
      const nextPath = normalized && normalized !== 'todos'
        ? `/search?category=${encodeURIComponent(normalized)}`
        : '/search';
      router.push(nextPath);
    }
  };

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isProfileMenuOpen]);

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
    if (!showCategories) {
      setInternalCategoryOptions([]);
      return;
    }

    let disposed = false;
    const hydrate = async () => {
      setLoadingInternalCategories(true);
      try {
        const dataset = await getSearchDatasetClient({ scope: 'catalog', forceRefresh: true });
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
    };
  }, [showCategories]);

  useEffect(() => {
    router.prefetch('/search');
    router.prefetch('/repertoires');
    router.prefetch('/profile');
    router.prefetch('/account');
    router.prefetch('/auth');
  }, [router]);

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
    if (!isMoreMenuOpen) {
      setIsMorePanelDragging(false);
      setMorePanelOffsetY(0);
      morePanelOffsetYRef.current = 0;
    }
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!isMoreMenuOpen || !isMobileCategoriesUi || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMoreMenuOpen, isMobileCategoriesUi]);

  const handleSignOut = async () => {
    setIsProfileMenuOpen(false);
    await signOut();
    router.push('/auth');
    router.refresh();
  };

  const onSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchTerm.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  const effectiveCategoryOptions = Array.from(
    new Set(
      categoryOptions
        .concat(internalCategoryOptions)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0 && value !== 'todos')
    )
  );

  const resolvedCategoryShortcuts = ['todos'].concat(
    Array.from(new Set(effectiveCategoryOptions)).slice(0, 4)
  );

  const extraCategories = Array.from(
    new Set(
      effectiveCategoryOptions
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0 && !resolvedCategoryShortcuts.includes(value))
    )
  );

  const filteredExtraCategories = extraCategories.filter((value) => {
    if (!categorySearchTerm.trim()) {
      return true;
    }
    return value.includes(categorySearchTerm.trim().toLowerCase());
  });

  const hasDynamicCategories = effectiveCategoryOptions.length > 0;
  const hasExtraCategories = extraCategories.length > 0;
  const shouldShowCategorySkeletons = loadingInternalCategories && !hasDynamicCategories;
  const shouldShowMorePanelSkeletons = loadingInternalCategories && !hasExtraCategories;

  const onMorePanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileCategoriesUi) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    setIsMorePanelDragging(true);
    morePanelPointerStartYRef.current = event.clientY;
    morePanelStartOffsetYRef.current = morePanelOffsetYRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onMorePanelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileCategoriesUi || !isMorePanelDragging) {
      return;
    }

    const deltaY = event.clientY - morePanelPointerStartYRef.current;
    const nextOffset = Math.max(-64, Math.min(280, morePanelStartOffsetYRef.current + deltaY));
    morePanelOffsetYRef.current = nextOffset;
    setMorePanelOffsetY(nextOffset);
  };

  const onMorePanelPointerEnd = () => {
    if (!isMobileCategoriesUi || !isMorePanelDragging) {
      return;
    }

    const shouldClose = morePanelOffsetYRef.current > 110;
    setIsMorePanelDragging(false);

    if (shouldClose) {
      setIsMoreMenuOpen(false);
      return;
    }

    morePanelOffsetYRef.current = 0;
    setMorePanelOffsetY(0);
  };

  return (
    <div className="topbar-stack layout-h-margin">
      <header className="topbar">
        <div className="brand-box">
          <Link href="/" aria-label="Ir al inicio">
            <Image src="/assets/icon/ofcanticumlogo.png" alt={text.brand} className="brand-logo-image" width={128} height={128} priority />
          </Link>
        </div>

        <form className="search-box" aria-label="Buscar canciones" onSubmit={onSearchSubmit}>
          <Image
            src="/assets/utils/iconly_light-outline_search/iconlylightoutlinesearch2x.png"
            alt="Buscar"
            width={16}
            height={16}
            className="action-icon"
          />
          <input
            className="search-input"
            type="search"
            name="home-search"
            placeholder={text.searchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </form>

        <nav className="top-actions" aria-label="acciones principales">
          <CreateMenu />
          <button type="button" onClick={openPremiumPlans}>
            <Image
              src="/assets/utils/iconly_light-outline_wallet/iconlylightoutlinewallet2x.png"
              alt="Suscribirte"
              width={16}
              height={16}
              className="action-icon"
            />
            {text.subscribe}
          </button>
          <button type="button" onClick={() => router.push('/repertoires')}>
            <Image
              src="/assets/utils/iconly_light-outline_document/iconlylightoutlinedocument2x.png"
              alt="repertorios"
              width={16}
              height={16}
              className="action-icon"
            />
            {text.repertoires}
          </button>
        </nav>

        <div className="welcome-box">
          <div className="avatar" aria-hidden>
            <Image
              src="/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png"
              alt="Perfil"
              width={22}
              height={22}
              className="profile-icon"
            />
          </div>

          {loading ? (
            <div className="welcome-menu-wrap">
              <span className="welcome-trigger"><span>···</span></span>
            </div>
          ) : user ? (
            <div className="welcome-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="welcome-trigger"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
              >
                <strong>{user.displayName ?? user.email ?? text.welcome}</strong>
              </button>

              {isProfileMenuOpen ? (
                <div className="welcome-dropdown" role="menu" aria-label="Menú de usuario">
                  <button
                    type="button"
                    role="menuitem"
                    className="welcome-dropdown-item"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push('/profile');
                    }}
                  >
                    Ajustes
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="welcome-dropdown-item"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push('/account');
                    }}
                  >
                    Cuenta
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="welcome-dropdown-item is-danger"
                    onClick={() => void handleSignOut()}
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="welcome-menu-wrap">
              <Link href="/auth" className="welcome-trigger">
                <span>{text.userNameLabel}</span>
                <strong>Iniciar sesión</strong>
              </Link>
            </div>
          )}
        </div>
      </header>

      {showCategories ? (
        <div className="header-categories" aria-label="Filtros por categoría">
          <div className="header-categories-row">
            <HorizontalConveyor className="header-categories-conveyor" ariaLabel="Accesos rápidos de categorías" scrollStep={220}>
              {hasDynamicCategories ? resolvedCategoryShortcuts.map((category) => {
                const isActive = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    className={`header-category-chip${isActive ? ' is-active' : ''}`}
                    onClick={() => applyCategoryChange(category)}
                  >
                    {formatCategoryLabel(category)}
                  </button>
                );
              }) : shouldShowCategorySkeletons ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={`category-skeleton-${index}`} width={92} height={36} borderRadius={999} className="header-category-chip-skeleton" />
                ))
              ) : null}

              {!hasDynamicCategories && !shouldShowCategorySkeletons ? (
                <button type="button" className="header-category-chip is-active" onClick={() => applyCategoryChange('todos')}>
                  Todos
                </button>
              ) : null} 
            </HorizontalConveyor>

            <div className={`header-categories-more${isMoreMenuOpen ? ' is-open' : ''}`} ref={categoriesMenuRef}>
              <button
                type="button"
                className={`header-category-chip header-category-chip-more${isMoreMenuOpen ? ' is-active' : ''}`}
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={isMoreMenuOpen}
              >
                Más <span className={`header-category-caret${isMoreMenuOpen ? ' is-open' : ''}`}>▼</span>
              </button>

              {isMoreMenuOpen ? (
                <>
                  {isMobileCategoriesUi ? (
                    <button
                      type="button"
                      className="header-categories-backdrop"
                      onClick={() => setIsMoreMenuOpen(false)}
                      aria-label="Cerrar panel de categorías"
                    />
                  ) : null}

                  <div
                    className={`header-categories-panel${isMorePanelDragging ? ' is-dragging' : ''}`}
                    role="dialog"
                    aria-label="Más categorías"
                    style={isMobileCategoriesUi ? { transform: `translateY(${morePanelOffsetY}px)` } : undefined}
                  >
                    <div
                      className="header-categories-panel-top"
                      onPointerDown={onMorePanelPointerDown}
                      onPointerMove={onMorePanelPointerMove}
                      onPointerUp={onMorePanelPointerEnd}
                      onPointerCancel={onMorePanelPointerEnd}
                    >
                    <span className="header-categories-grabber" aria-hidden />
                    <h4 className="header-categories-title">Más</h4>
                    </div>

                  <input
                    type="search"
                    className="header-categories-search"
                    placeholder="Buscar"
                    value={categorySearchTerm}
                    onChange={(event) => setCategorySearchTerm(event.target.value)}
                  />

                  <div className="header-categories-list" role="listbox" aria-label="Listado de categorías">
                    {filteredExtraCategories.length > 0 ? filteredExtraCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`header-categories-list-item${selectedCategory === category ? ' is-active' : ''}`}
                        onClick={() => {
                          applyCategoryChange(category);
                          setIsMoreMenuOpen(false);
                        }}
                      >
                        {formatCategoryLabel(category)}
                      </button>
                    )) : shouldShowMorePanelSkeletons ? (
                      Array.from({ length: 7 }).map((_, index) => (
                        <Skeleton key={`category-list-skeleton-${index}`} height={30} borderRadius={10} className="header-categories-list-skeleton" />
                      ))
                    ) : null}

                    {hasDynamicCategories && !shouldShowMorePanelSkeletons && filteredExtraCategories.length === 0 ? (
                      <p className="header-categories-empty">No hay categorías para ese filtro.</p>
                    ) : null}
                  </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

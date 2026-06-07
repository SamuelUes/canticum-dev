'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SkeletonList } from './skeleton';

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
  const [isOpen, setIsOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDragStart = useCallback((clientY: number) => {
    dragStartRef.current = clientY;
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (dragStartRef.current === null) return;
    const delta = clientY - dragStartRef.current;
    setDragOffset(delta > 0 ? delta : 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    setDragOffset((current) => {
      if (current > 110) {
        onClose();
      }
      return 0;
    });
  }, [onClose]);

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

  const panelStyle = mobile && dragOffset > 0
    ? { transform: `translateY(${dragOffset}px)` }
    : undefined;

  const panel = (
    <div
      ref={panelRef}
      className={`header-categories-panel${mobile ? ' is-mobile' : ''}${isOpen ? ' is-open' : ''}${dragOffset > 0 ? ' is-dragging' : ''}`}
      role="dialog"
      aria-label="Más categorías"
      style={panelStyle}
    >
      {mobile ? (
        <div
          className="header-categories-panel-top"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            handleDragStart(event.clientY);
          }}
          onPointerMove={(event) => handleDragMove(event.clientY)}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
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
          <SkeletonList count={7} className="header-categories-list-skeleton" />
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

  if (mobile) {
    const mobilePanel = (
      <>
        <button type="button" className={`header-categories-backdrop${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-label="Cerrar panel de categorías" />
        {panel}
      </>
    );

    if (typeof document !== 'undefined') {
      return createPortal(mobilePanel, document.body);
    }

    return mobilePanel;
  }

  return (
    <div className="header-categories-more is-open">{panel}</div>
  );
}

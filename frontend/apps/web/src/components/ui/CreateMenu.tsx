'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../features/auth/repository';

export function CreateMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();
  const canManageAdminShortcuts = isAdminUser(user);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleToggle = () => {
    if (loading) return;

    if (!user) {
      router.push('/auth?reason=create');
      return;
    }

    setIsOpen((prev) => !prev);
  };

  const handleOption = useCallback((path: string) => {
    setIsOpen(false);
    router.push(path);
  }, [router]);

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="crear"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogTitleId : undefined}
        onClick={handleToggle}
        ref={triggerRef}
      >
        <span className="material-symbols-outlined action-icon" aria-hidden="true">add_circle</span>
      </button>

      {isOpen && mounted
        ? createPortal(
            <div
              className="create-overlay-backdrop"
              onClick={() => setIsOpen(false)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Cerrar selector de creación"
            >
              <div
                className="create-overlay-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id={dialogTitleId} className="create-overlay-title">Escoge que se creará</h2>

                <div className="create-overlay-options">
                  <button
                    type="button"
                    className="create-overlay-card create-overlay-card--song"
                    onClick={() => handleOption('/create/song')}
                  >
                    <span className="create-overlay-card-icon">♫</span>
                    <strong>Canción</strong>
                  </button>

                  <button
                    type="button"
                    className="create-overlay-card create-overlay-card--repertoire"
                    onClick={() => handleOption('/create/repertoires')}
                  >
                    <span className="create-overlay-card-icon">☰</span>
                    <strong>Repertorio</strong>
                  </button>

                  {canManageAdminShortcuts ? (
                    <button
                      type="button"
                      className="create-overlay-card create-overlay-card--misal"
                      onClick={() => handleOption('/admin/misales')}
                    >
                      <span className="create-overlay-card-icon">📄</span>
                      <strong>Misal semanal</strong>
                    </button>
                  ) : null}

                  {canManageAdminShortcuts ? (
                    <button
                      type="button"
                      className="create-overlay-card create-overlay-card--album"
                      onClick={() => handleOption('/admin/albums')}
                    >
                      <span className="create-overlay-card-icon">💿</span>
                      <strong>Álbum</strong>
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="create-overlay-close"
                  aria-label="Cerrar"
                  onClick={() => setIsOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

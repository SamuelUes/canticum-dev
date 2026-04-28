'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export function CreateMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();

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
        onClick={handleToggle}
      >
        <Image
          src="/assets/utils/iconly_light-outline_plus/iconlylightoutlineplus2x.png"
          alt="Agregar"
          width={18}
          height={18}
          className="action-icon"
        />
      </button>

      {isOpen && (
        <div className="create-overlay-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="create-overlay-panel"
            role="dialog"
            aria-label="Escoge qué se creará"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="create-overlay-title">Escoge que se creará</h2>

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
        </div>
      )}
    </>
  );
}

'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export function CreateMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleToggle = () => {
    if (loading) return;

    if (!user) {
      router.push('/auth?reason=create');
      return;
    }

    setIsOpen((prev) => !prev);
  };

  const handleOption = (path: string) => {
    setIsOpen(false);
    router.push(path);
  };

  return (
    <div className="create-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="icon-button"
        aria-label="crear"
        aria-haspopup="menu"
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
        <div className="create-menu-dropdown" role="menu" aria-label="Opciones de creación">
          <button
            type="button"
            role="menuitem"
            className="create-menu-item"
            onClick={() => handleOption('/crear/cancion')}
          >
            <span className="create-menu-icon">♫</span>
            <div className="create-menu-item-text">
              <strong>Subir Canción</strong>
              <small>Letra, audio y metadatos</small>
            </div>
          </button>
          <button
            type="button"
            role="menuitem"
            className="create-menu-item"
            onClick={() => handleOption('/crear/esquema')}
          >
            <span className="create-menu-icon">☰</span>
            <div className="create-menu-item-text">
              <strong>Crear Esquema</strong>
              <small>Organiza canciones litúrgicas</small>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

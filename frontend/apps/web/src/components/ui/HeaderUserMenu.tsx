'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface HeaderUserMenuProps {
  loading: boolean;
  user: { displayName?: string | null; email?: string | null } | null;
  welcomeLabel: string;
  profileLabel: string;
  accountLabel: string;
  signOutLabel: string;
  onProfile: () => void;
  onAccount: () => void;
  onSignOut: () => void;
}

export function HeaderUserMenu({
  loading,
  user,
  welcomeLabel,
  profileLabel,
  accountLabel,
  signOutLabel,
  onProfile,
  onAccount,
  onSignOut
}: HeaderUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return (
      <div className="welcome-menu-wrap" aria-busy="true">
        <span className="welcome-trigger welcome-trigger-placeholder" aria-label="Cargando sesión">
          <span>···</span>
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="welcome-menu-wrap">
        <Link href="/auth" className="welcome-trigger">
          <span>{profileLabel}</span>
          <strong>{welcomeLabel}</strong>
        </Link>
      </div>
    );
  }

  return (
    <div className="welcome-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="welcome-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>{profileLabel}</span>
        <strong>{user.displayName ?? user.email ?? welcomeLabel}</strong>
      </button>

      {isOpen ? (
        <div className="welcome-dropdown" role="menu" aria-label="Menú de usuario">
          <button
            type="button"
            role="menuitem"
            className="welcome-dropdown-item"
            onClick={() => {
              setIsOpen(false);
              onProfile();
            }}
          >
            {profileLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="welcome-dropdown-item"
            onClick={() => {
              setIsOpen(false);
              onAccount();
            }}
          >
            {accountLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="welcome-dropdown-item is-danger"
            onClick={() => {
              setIsOpen(false);
              onSignOut();
            }}
          >
            {signOutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

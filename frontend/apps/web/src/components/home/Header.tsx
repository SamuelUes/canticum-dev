'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import type { HomeText } from '../../types/home';
import { CreateMenu } from '../ui/CreateMenu';

interface HeaderProps {
  text: HomeText;
}

export function Header({ text }: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { openPremiumPlans } = usePremiumNavigation();
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="topbar layout-h-margin">
      <div className="brand-box">
        <Link href="/" aria-label="Ir al inicio">
          <Image src="/assets/icon/ofcanticumlogo.png" alt={text.brand} className="brand-logo-image" width={88} height={88} />
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
              {/* <span>{text.userNameLabel}</span> */}
              <strong>{user.displayName ?? user.email ?? text.welcome}</strong>
            </button>

            {isProfileMenuOpen ? (
              <div className="welcome-dropdown" role="menu" aria-label="Menú de usuario">
                <button type="button" role="menuitem" className="welcome-dropdown-item">
                  Ajustes
                </button>
                <button type="button" role="menuitem" className="welcome-dropdown-item">
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
  );
}

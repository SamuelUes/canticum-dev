'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePremiumNavigation } from '../../hooks/usePremiumNavigation';
import type { HomeText } from '../../types/home';
import { CommandSearch } from '../ui/CommandSearch';
import { CreateMenu } from '../ui/CreateMenu';
import { HeaderActionGroup } from '../ui/HeaderActionGroup';
import { HeaderBrand } from '../ui/HeaderBrand';
import { HeaderUserMenu } from '../ui/HeaderUserMenu';

interface HeaderProps {
  text: HomeText;
}

export function Header({ text }: HeaderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { openPremiumPlans } = usePremiumNavigation();
  const canManageMisales = user?.role === 'admin' || user?.role === 'editor';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const win = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const prefetchRoutes = () => {
      router.prefetch('/search');
      router.prefetch('/repertoires');
      router.prefetch('/profile');
      router.prefetch('/account');
      router.prefetch('/auth');
      if (canManageMisales) {
        router.prefetch('/admin/misales');
      }
    };

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(() => prefetchRoutes());
      return () => {
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = win.setTimeout(prefetchRoutes, 900);
    return () => win.clearTimeout(timeoutId);
  }, [router, canManageMisales]);

  const handleSignOut = async () => {
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
    <div className="topbar-stack layout-h-margin">
      <header className="topbar">
        <HeaderBrand brand={text.brand} />

        <CommandSearch placeholder={text.searchPlaceholder} value={searchTerm} onChange={setSearchTerm} onSubmit={onSearchSubmit} />

        <HeaderActionGroup
          primaryAction={<CreateMenu />}
          subscribeLabel={text.subscribe}
          repertoiresLabel={text.repertoires}
          onSubscribe={openPremiumPlans}
        />

        <div className="welcome-box">
          <div className="avatar" aria-hidden>
            <span className="material-symbols-outlined profile-icon" aria-hidden="true">person</span>
          </div>

          <HeaderUserMenu
            loading={loading}
            user={user ? { displayName: user.displayName, email: user.email } : null}
            welcomeLabel={text.welcome}
            profileLabel={text.userNameLabel}
            accountLabel="Cuenta"
            signOutLabel="Cerrar sesión"
            onProfile={() => router.push('/profile')}
            onAccount={() => router.push('/account')}
            onSignOut={() => void handleSignOut()}
          />
        </div>
      </header>
    </div>
  );
}

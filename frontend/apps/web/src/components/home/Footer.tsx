'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { getSearchDatasetClient } from '../../features/search/repository';
import type { FooterSection, HomeText } from '../../types/home';

interface HomeFooterProps {
  text: Pick<HomeText, 'footerKnowTitle' | 'footerKnowDescription' | 'footerCopyright'>;
  sections: FooterSection[];
}

function formatCategoryLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, ' ');
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function useFooterCategories() {
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    const hydrate = async () => {
      try {
        const dataset = await getSearchDatasetClient({ scope: 'catalog', signal: controller.signal });
        if (disposed) return;
        const normalized = dataset.filters.categories
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0 && value !== 'todos');
        setCategories(Array.from(new Set(normalized)));
      } catch {
        // Fail silently: the footer should still render without live categories.
      }
    };

    void hydrate();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  return categories;
}

const socialLinks = [
  { id: 'instagram', label: 'Instagram', href: '#' },
  { id: 'facebook', label: 'Facebook', href: '#' },
  { id: 'youtube', label: 'YouTube', href: '#' }
];

const navigationLinks = [
  { id: 'nav-search', label: 'Buscar', href: '/search' },
  { id: 'nav-repertoires', label: 'Repertorios', href: '/repertoires' }
];

export function HomeFooter({ text, sections }: HomeFooterProps) {
  const categories = useFooterCategories();
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer className="home-footer" aria-labelledby="footer-heading">
      <span id="footer-heading" className="visually-hidden">
        Pie de página
      </span>

      <div className="home-footer-surface layout-h-margin">
        <div className="home-footer-grid">
          <div className="home-footer-brand">
            <a href="/" className="home-footer-logo-link" aria-label="Canticum, inicio">
              <Image
                src="/assets/icon/canticum-imagotipo-compacto-color.svg"
                alt="Canticum"
                width={120}
                height={92}
                className="home-footer-logo"
                unoptimized
              />
            </a>
            <p className="home-footer-tagline">{text.footerKnowDescription}</p>
            <div className="home-footer-social" aria-label="Redes sociales">
              {socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  className="home-footer-social-link"
                  aria-label={link.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {link.id === 'youtube' ? 'play_circle' : 'groups'}
                  </span>
                </a>
              ))}
            </div>
          </div>

          <nav className="home-footer-column" aria-label="Categorías">
            <h3 className="home-footer-column-title">Categorías</h3>
            <ul className="home-footer-links" role="list">
              <li>
                <a href="/search" className="home-footer-link">
                  Todos
                </a>
              </li>
              {categories.slice(0, 8).map((category) => (
                <li key={category}>
                  <a
                    href={`/search?category=${encodeURIComponent(category)}`}
                    className="home-footer-link"
                  >
                    {formatCategoryLabel(category)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="home-footer-column" aria-label="Navegación">
            <h3 className="home-footer-column-title">Navegación</h3>
            <ul className="home-footer-links" role="list">
              {navigationLinks.map((link) => (
                <li key={link.id}>
                  <a href={link.href} className="home-footer-link">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {sections.slice(0, 2).map((section) => (
            <nav key={section.id} className="home-footer-column" aria-label={section.title}>
              <h3 className="home-footer-column-title">{section.title}</h3>
              <ul className="home-footer-links" role="list">
                {section.links.map((link) => (
                  <li key={link.id}>
                    <a href={link.href} className="home-footer-link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="home-footer-bottom">
          <p className="home-footer-copyright">
            © {currentYear} Canticum. {text.footerCopyright}
          </p>
          <div className="home-footer-legal">
            <a href="/privacy">Privacidad</a>
            <span aria-hidden="true">·</span>
            <a href="/terms">Términos</a>
            <span aria-hidden="true">·</span>
            <a href="/cookies">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CollapsiblePanel } from '../ui/CollapsiblePanel';
import { SkeletonText, SkeletonTitle } from '../ui/skeleton';
import { loadSongFavorite, saveSongFavorite } from '../../features/song/clientPersistence';
import type { HomeText, ListItemData } from '../../types/home';

function FavoriteButton({ songId }: { songId: string }) {
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadSongFavorite(songId, 'default').then((value) => {
      if (!disposed && typeof value === 'boolean') {
        setIsFavorite(value);
      }
    });
    return () => { disposed = true; };
  }, [songId]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextValue = !isFavorite;
    setIsFavorite(nextValue);
    void saveSongFavorite(songId, 'default', nextValue);
  };

  return (
    <button
      type="button"
      className={isFavorite ? 'mini-item-favorite is-active' : 'mini-item-favorite'}
      aria-label={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      aria-pressed={isFavorite}
      onClick={handleToggle}
    >
      <span className="material-symbols-outlined">{isFavorite ? 'favorite' : 'heart_plus'}</span>
    </button>
  );
}

function TrendDelta({ item }: { item: ListItemData }) {
  const delta = item.rankDelta;

  if (delta === null || delta === undefined) {
    return (
      <div className="mini-item-delta mini-item-delta--new" aria-hidden>
        <span className="mini-item-delta-label">NUEVO</span>
      </div>
    );
  }

  if (delta > 0) {
    return (
      <div className="mini-item-delta mini-item-delta--up" aria-hidden>
        {/* <span className="mini-item-score">{score ?? '—'}</span> */}
        <span className="mini-item-delta-indicator">
          <span className="material-symbols-outlined">keyboard_arrow_up</span> {delta}
        </span>
      </div>
    );
  }

  if (delta < 0) {
    return (
      <div className="mini-item-delta mini-item-delta--down" aria-hidden>
        {/* <span className="mini-item-score">{score ?? '—'}</span> */}
        <span className="mini-item-delta-indicator">
          <span className="material-symbols-outlined">keyboard_arrow_down</span> {Math.abs(delta)}
        </span>
      </div>
    );
  }

  return (
    <div className="mini-item-delta mini-item-delta--flat" aria-hidden>
      {/* <span className="mini-item-score">{score ?? '—'}</span> */}
      <span className="mini-item-delta-indicator">—</span>
    </div>
  );
}

interface ListColumnProps {
  title: string;
  viewAllLabel: HomeText['viewAll'];
  viewAllHref?: string;
  items: ListItemData[];
  linkBasePath?: string;
  resolveItemHref?: (item: ListItemData) => string | null;
  variant?: 'trends' | 'recent';
}

interface DualListSectionProps {
  left: ListColumnProps;
  right: ListColumnProps;
  loading?: boolean;
}

function ListColumn({ title, viewAllLabel, viewAllHref, items, linkBasePath, resolveItemHref, variant = 'recent' }: ListColumnProps) {
  const buildHref = (item: ListItemData): string | null => {
    if (resolveItemHref) {
      try {
        const resolved = resolveItemHref(item);
        return resolved && resolved.trim().length > 0 ? resolved : null;
      } catch {
        return null;
      }
    }

    if (linkBasePath) {
      return `${linkBasePath}/${item.id}`;
    }

    return null;
  };

  return (
    <CollapsiblePanel
      title={title}
      className="list-column"
      rightSlot={
        viewAllHref ? (
          <Link href={viewAllHref} className="view-all-link more-pill-link" aria-label={`${viewAllLabel}: ${title}`}>
            {viewAllLabel}
          </Link>
        ) : null
      }
    >
      <div className={`mini-list mini-list--${variant}`}>
        {items.map((item, index) => (
          (() => {
            const href = buildHref(item);
            const leading = variant === 'trends'
              ? <span className="mini-item-rank" aria-hidden>{index + 1}</span>
              : null;
            const trailing = variant === 'recent'
              ? <FavoriteButton songId={item.id} />
              : <TrendDelta item={item} />;

            if (href) {
              return (
                <Link key={item.id} href={href} className="mini-item mini-item-button" aria-label={item.title}>
                  {leading}
                  {item.avatarUrl ? (
                    <Image src={item.avatarUrl} alt={item.title} className="mini-avatar-image" width={38} height={38} />
                  ) : (
                    <div className="mini-avatar">
                      <span className="material-symbols-outlined placeholder-icon" aria-hidden="true">x_circle</span>
                    </div>
                  )}
                  <div className="mini-item-content">
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                  {trailing}
                </Link>
              );
            }

            return (
              <button key={item.id} type="button" className="mini-item mini-item-button" aria-label={item.title}>
                {leading}
                {item.avatarUrl ? (
                  <Image src={item.avatarUrl} alt={item.title} className="mini-avatar-image" width={38} height={38} />
                ) : (
                  <div className="mini-avatar">
                    <span className="material-symbols-outlined placeholder-icon" aria-hidden="true">person</span>
                  </div>
                )}
                <div className="mini-item-content">
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </div>
                {trailing}
              </button>
            );
          })()
        ))}
      </div>
    </CollapsiblePanel>
  );
}

export function DualListSection({ left, right, loading = false }: DualListSectionProps) {
  if (loading) {
    return (
      <section className="home-section double-list-section layout-h-margin" aria-busy>
        {[0, 1].map((column) => (
          <div key={column} className="list-column">
            <SkeletonTitle />
            <SkeletonText count={5} className="home-skeleton-line" />
          </div>
        ))}
      </section>
    );
  }

  if (left.items.length === 0 && right.items.length === 0) {
    return null;
  }

  return (
    <section className="home-section double-list-section layout-h-margin">
      {left.items.length > 0 ? (
        <ListColumn
          title={left.title}
          viewAllLabel={left.viewAllLabel}
          viewAllHref={left.viewAllHref}
          items={left.items}
          linkBasePath={left.linkBasePath}
          resolveItemHref={left.resolveItemHref}
          variant={left.variant}
        />
      ) : null}
      {right.items.length > 0 ? (
        <ListColumn
          title={right.title}
          viewAllLabel={right.viewAllLabel}
          viewAllHref={right.viewAllHref}
          items={right.items}
          linkBasePath={right.linkBasePath}
          resolveItemHref={right.resolveItemHref}
          variant={right.variant}
        />
      ) : null}
    </section>
  );
}

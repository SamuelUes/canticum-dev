import Image from 'next/image';
import Link from 'next/link';
import { CollapsiblePanel } from '../ui/CollapsiblePanel';
import type { HomeText, ListItemData } from '../../types/home';

interface ListColumnProps {
  title: string;
  viewAllLabel: HomeText['viewAll'];
  items: ListItemData[];
  linkBasePath?: string;
}

interface DualListSectionProps {
  left: ListColumnProps;
  right: ListColumnProps;
}

function ListColumn({ title, viewAllLabel, items, linkBasePath }: ListColumnProps) {
  return (
    <CollapsiblePanel
      title={title}
      className="list-column"
      rightSlot={
        <a href="#" className="view-all-link more-pill-link">
          {viewAllLabel}
        </a>
      }
    >
      <div className="mini-list">
        {items.map((item) => (
          linkBasePath ? (
            <Link key={item.id} href={`${linkBasePath}/${item.id}`} className="mini-item mini-item-button" aria-label={item.title}>
              {item.avatarUrl ? (
                <Image src={item.avatarUrl} alt={item.title} className="mini-avatar-image" width={38} height={38} />
              ) : (
                <div className="mini-avatar">
                  <Image
                    src="/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png"
                    alt={item.title}
                    width={14}
                    height={14}
                    className="placeholder-icon"
                  />
                </div>
              )}
              <div className="mini-item-content">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
            </Link>
          ) : (
            <button key={item.id} type="button" className="mini-item mini-item-button" aria-label={item.title}>
              {item.avatarUrl ? (
                <Image src={item.avatarUrl} alt={item.title} className="mini-avatar-image" width={38} height={38} />
              ) : (
                <div className="mini-avatar">
                  <Image
                    src="/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png"
                    alt={item.title}
                    width={14}
                    height={14}
                    className="placeholder-icon"
                  />
                </div>
              )}
              <div className="mini-item-content">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
            </button>
          )
        ))}
      </div>
    </CollapsiblePanel>
  );
}

export function DualListSection({ left, right }: DualListSectionProps) {
  return (
    <section className="home-section double-list-section layout-h-margin">
      <ListColumn title={left.title} viewAllLabel={left.viewAllLabel} items={left.items} linkBasePath={left.linkBasePath} />
      <ListColumn title={right.title} viewAllLabel={right.viewAllLabel} items={right.items} linkBasePath={right.linkBasePath} />
    </section>
  );
}

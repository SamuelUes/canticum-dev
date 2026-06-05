'use client';

import { useId, useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  rightSlot?: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  headingLevel?: 2 | 3;
  unmountWhenCollapsed?: boolean;
  children: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  rightSlot,
  defaultExpanded = true,
  className,
  headingLevel = 2,
  unmountWhenCollapsed = false,
  children
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const contentId = `${panelId}-content`;
  const titleId = `${panelId}-title`;
  const HeadingTag = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <section className={`collapsible-panel ${className ?? ''}`.trim()}>
      <div className="collapsible-header">
        <HeadingTag id={titleId}>{title}</HeadingTag>

        <div className="collapsible-actions">
          {rightSlot}
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            aria-label={isExpanded ? `Contraer ${title}` : `Expandir ${title}`}
          >
            <span className={isExpanded ? 'collapse-icon is-expanded' : 'collapse-icon'}>▾</span>
          </button>
        </div>
      </div>

      {isExpanded || !unmountWhenCollapsed ? (
        <div
          id={contentId}
          className="collapsible-content"
          role="region"
          aria-labelledby={titleId}
          hidden={!isExpanded}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

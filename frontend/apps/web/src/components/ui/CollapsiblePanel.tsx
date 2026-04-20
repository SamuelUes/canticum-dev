'use client';

import { useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  rightSlot?: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  rightSlot,
  defaultExpanded = true,
  className,
  children
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className={`collapsible-panel ${className ?? ''}`.trim()}>
      <div className="collapsible-header">
        <h2>{title}</h2>

        <div className="collapsible-actions">
          {rightSlot}
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Contraer ${title}` : `Expandir ${title}`}
          >
            <span className={isExpanded ? 'collapse-icon is-expanded' : 'collapse-icon'}>▾</span>
          </button>
        </div>
      </div>

      {isExpanded ? <div className="collapsible-content">{children}</div> : null}
    </section>
  );
}

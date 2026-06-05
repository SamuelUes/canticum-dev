'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

interface HeaderActionGroupProps {
  primaryAction: ReactNode;
  subscribeLabel: string;
  repertoiresLabel: string;
  onSubscribe: () => void;
}

export function HeaderActionGroup({ primaryAction, subscribeLabel, repertoiresLabel, onSubscribe }: HeaderActionGroupProps) {
  const router = useRouter();

  return (
    <nav className="top-actions header-action-group" aria-label="acciones principales">
      {primaryAction}
      <button type="button" onClick={onSubscribe} className="header-action-button header-action-button--premium">
        <span className="material-symbols-outlined action-icon" aria-hidden="true">wallet</span>
        {subscribeLabel}
      </button>
      <button type="button" onClick={() => router.push('/repertoires')} className="header-action-button">
        <span className="material-symbols-outlined action-icon" aria-hidden="true">description</span>
        {repertoiresLabel}
      </button>
    </nav>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export interface LoadingBubbleProps {
  /** When true, the bubble is visible. Set to false to dismiss. */
  isLoading: boolean;
  /** Message shown inside the bubble. */
  message?: string;
  /** Delay (ms) before showing the bubble. Avoids flicker on fast loads. */
  showDelay?: number;
  /** Delay (ms) before hiding after isLoading becomes false. */
  hideDelay?: number;
}

export function LoadingBubble({
  isLoading,
  message = 'Cargando…',
  showDelay = 200,
  hideDelay = 300
}: LoadingBubbleProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const showTimer = setTimeout(() => setVisible(true), showDelay);
      return () => clearTimeout(showTimer);
    }

    const hideTimer = setTimeout(() => setVisible(false), hideDelay);
    return () => clearTimeout(hideTimer);
  }, [isLoading, showDelay, hideDelay]);

  if (!visible) return null;

  return (
    <div
      className="loading-bubble-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-bubble-card">
        <div className="loading-bubble-card__isotipo" aria-hidden="true">
          <Image
            src="/assets/icon/canticum-isotipo-color.svg"
            alt=""
            width={42}
            height={42}
            priority
          />
        </div>
        <p className="loading-bubble-card__message">{message}</p>
        <span className="loading-bubble-card__dots" aria-hidden="true">
          <span /><span /><span />
        </span>
      </div>
    </div>
  );
}

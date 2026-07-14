'use client';

import { useEffect, useState } from 'react';

export type FloatingNoticeVariant = 'info' | 'warning' | 'success' | 'error';

export interface FloatingNoticeProps {
  message: string;
  variant?: FloatingNoticeVariant;
  /** Auto-dismiss in ms. 0 keeps it visible until user closes. */
  duration?: number;
  onClose?: () => void;
}

const variantIcon: Record<FloatingNoticeVariant, string> = {
  info: 'info',
  warning: 'warning',
  success: 'check_circle',
  error: 'error'
};

export function FloatingNotice({ message, variant = 'info', duration = 0, onClose }: FloatingNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div
      className="floating-notice-overlay"
      role="alertdialog"
      aria-live="polite"
      onClick={() => {
        setVisible(false);
        onClose?.();
      }}
    >
      <div
        className={`floating-notice floating-notice--${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="floating-notice__icon material-symbols-outlined">
          {variantIcon[variant]}
        </span>
        <p className="floating-notice__message">{message}</p>
        <button
          type="button"
          className="floating-notice__close"
          aria-label="Cerrar aviso"
          onClick={() => {
            setVisible(false);
            onClose?.();
          }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}

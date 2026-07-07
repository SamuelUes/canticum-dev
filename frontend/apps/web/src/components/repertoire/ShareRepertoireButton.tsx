'use client';

import { useState } from 'react';

interface ShareRepertoireButtonProps {
  repertoireId: string;
  className?: string;
  iconClassName?: string;
}

export function ShareRepertoireButton({ repertoireId, className, iconClassName }: ShareRepertoireButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const url = `${window.location.origin}/repertoires/${repertoireId}`;
    const shareData = {
      title: 'Repertorio Canticum',
      text: 'Mira este repertorio en Canticum',
      url,
    };

    // Use native Web Share API only on mobile devices (iOS Safari, Android Chrome)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="repertoire-share-wrapper">
      <button
        type="button"
        aria-label="Compartir repertorio"
        title={copied ? 'Enlace copiado' : 'Copiar enlace del repertorio'}
        onClick={handleShare}
        className={className}
      >
        <span className={`material-symbols-outlined${iconClassName ? ` ${iconClassName}` : ''}`}>
          {copied ? 'check' : 'share'}
        </span>
      </button>
      {copied && (
        <span className="repertoire-share-bubble" role="status" aria-live="polite">
          Enlace copiado
        </span>
      )}
    </span>
  );
}

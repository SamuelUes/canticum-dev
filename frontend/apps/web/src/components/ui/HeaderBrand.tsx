'use client';

import Image from 'next/image';
import Link from 'next/link';

interface HeaderBrandProps {
  brand: string;
}

export function HeaderBrand({ brand }: HeaderBrandProps) {
  return (
    <div className="header-brand">
      <Link href="/" aria-label="Ir al inicio" className="header-brand-link">
        <Image src="/assets/icon/canticum-imagotipo-compacto-color.svg" alt={brand} className="brand-logo-image" width={64} height={64} priority />
      </Link>
      <div className="header-brand-copy">
        <span className="header-brand-kicker"></span>
        <strong>{brand}</strong>
      </div>
    </div>
  );
}

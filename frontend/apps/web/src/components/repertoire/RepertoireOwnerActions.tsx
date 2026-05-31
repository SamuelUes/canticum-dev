'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

interface RepertoireOwnerActionsProps {
  repertoireId: string;
  ownerUserId?: string;
}

export function RepertoireOwnerActions({ repertoireId, ownerUserId }: RepertoireOwnerActionsProps) {
  const { user } = useAuth();
  const isOwner = Boolean(user?.uid && ownerUserId && user.uid === ownerUserId);

  if (!isOwner) {
    return null;
  }

  return (
    <>
      <div className="repertoire-detail-meta-actions">
        <Link href={`/repertoires/${repertoireId}/edit`} className="repertoire-detail-edit-link" aria-label="Editar repertorio">
          <Image
            src="/assets/utils/iconly_light-outline_edit/iconlylightoutlineedit2x.png"
            alt="Editar"
            width={18}
            height={18}
          />
          <span>Editar</span>
        </Link>
      </div>

      <div className="repertoire-edit-actions">
        <Link href={`/repertoires/${repertoireId}/edit`} className="song-premium-badge">
          Editar repertorio
        </Link>
        <Link href={`/repertoires/${repertoireId}/edit`} className="song-premium-badge is-buy">
          Eliminar repertorio
        </Link>
      </div>
    </>
  );
}

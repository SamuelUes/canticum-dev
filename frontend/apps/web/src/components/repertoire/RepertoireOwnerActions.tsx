'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../features/auth/repository';
import { requestUpdateRepertoireStatus } from '../../features/repertoire/repository';
import {
  REPERTOIRE_STATUS_HELPERS,
  REPERTOIRE_STATUS_LABELS,
  REPERTOIRE_STATUS_OPTIONS,
  normalizeRepertoireStatus
} from '../../features/repertoire/status';

interface RepertoireOwnerActionsProps {
  repertoireId: string;
  ownerUserId?: string;
  initialStatus?: string;
  isPublic?: boolean;
}

export function RepertoireOwnerActions({ repertoireId, initialStatus, isPublic }: RepertoireOwnerActionsProps) {
  const { user } = useAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusSelection, setStatusSelection] = useState(() => normalizeRepertoireStatus(initialStatus));
  const canManage = isAdminUser(user);
  const statusLabel = REPERTOIRE_STATUS_LABELS[statusSelection];

  const onApplyStatus = async () => {
    if (!canManage || isPublishing) {
      return;
    }

    setIsPublishing(true);
    const result = await requestUpdateRepertoireStatus(repertoireId, statusSelection, isPublic);
    setIsPublishing(false);

    if (result.ok && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <div className="repertoire-owner-actions-panel" aria-label="Acciones del repertorio">
      <div className="repertoire-edit-actions">
        <Link href={`/repertoires/${repertoireId}/edit`} className="repertoire-action-button">
          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
          Editar
        </Link>
        <Link href={`/repertoires/${repertoireId}/edit`} className="repertoire-action-button is-danger">
          Eliminar
        </Link>
      </div>

      <div className="repertoire-status-control">
        <div className="song-admin-status-combobox repertoire-status-combobox" data-open={isStatusMenuOpen ? 'true' : 'false'}>
          <button
            type="button"
            className="song-admin-status-combobox-trigger"
            aria-haspopup="listbox"
            aria-expanded={isStatusMenuOpen}
            aria-label="Cambiar estado del repertorio"
            onClick={() => setIsStatusMenuOpen((prev) => !prev)}
          >
            <span className="song-admin-status-combobox-copy">
              <small>Estado actual</small>
              <strong>{statusLabel}</strong>
            </span>
            <span className="song-admin-status-combobox-chevron" aria-hidden>
              ▾
            </span>
          </button>

          {isStatusMenuOpen ? (
            <div className="song-admin-status-combobox-menu repertoire-status-combobox-menu" aria-label="Opciones de estado del repertorio">
              <div role="listbox" aria-label="Seleccionar estado del repertorio" className="repertoire-status-combobox-list">
                {REPERTOIRE_STATUS_OPTIONS.map((option) => {
                  const isActive = statusSelection === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`song-admin-status-combobox-option status-${option.toLowerCase()} ${isActive ? 'is-active' : ''}`}
                      onClick={() => setStatusSelection(option)}
                    >
                      <span className="song-admin-status-combobox-option-top">
                        <strong>{REPERTOIRE_STATUS_LABELS[option]}</strong>
                        {isActive ? <span className="song-admin-status-combobox-current">Actual</span> : null}
                      </span>
                      <small>{REPERTOIRE_STATUS_HELPERS[option]}</small>
                    </button>
                  );
                })}
              </div>

              <div className="repertoire-status-combobox-footer">
                <button type="button" className="song-admin-status-action repertoire-status-save-button" onClick={onApplyStatus} disabled={isPublishing}>
                  {isPublishing ? 'Guardando...' : 'Guardar estado'}
                </button>
                <button type="button" className="repertoire-status-close-button" onClick={() => setIsStatusMenuOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

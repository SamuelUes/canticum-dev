'use client';

import { useEffect, useState, useCallback } from 'react';

export type FloatingStatusState =
  | 'idle'
  | 'loading'
  | 'uploading'
  | 'creating'
  | 'updating'
  | 'success'
  | 'cancelled'
  | 'error';

export interface FloatingStatusOverlayProps {
  /** Current processing state */
  state: FloatingStatusState;
  /** Main message shown to the user */
  message?: string;
  /** Optional secondary detail line */
  detail?: string;
  /** Progress percentage 0–100. If omitted, indeterminate bar is shown. */
  progress?: number;
  /** Auto-dismiss success/cancelled/error after N ms. 0 = manual. */
  autoDismiss?: number;
  /** Called when overlay is dismissed or auto-dismissed */
  onDismiss?: () => void;
  /** Called when the cancel button is pressed */
  onCancel?: () => void;
  /** Show a cancel button during active states (loading/uploading/creating/updating) */
  cancellable?: boolean;
}

const stateConfig: Record<
  FloatingStatusState,
  { icon: string; label: string; spin: boolean; tone: string }
> = {
  idle:       { icon: 'hourglass_empty',   label: 'En espera',          spin: false, tone: 'neutral'   },
  loading:    { icon: 'progress_activity',  label: 'Cargando',           spin: true,  tone: 'primary'   },
  uploading:  { icon: 'cloud_upload',       label: 'Subiendo',           spin: true,  tone: 'primary'   },
  creating:   { icon: 'add_circle',         label: 'Creando',            spin: true,  tone: 'primary'   },
  updating:   { icon: 'sync',               label: 'Actualizando',       spin: true,  tone: 'primary'   },
  success:    { icon: 'check_circle',       label: 'Completado',         spin: false, tone: 'success'   },
  cancelled:  { icon: 'cancel',             label: 'Cancelado',          spin: false, tone: 'warning'   },
  error:      { icon: 'error',              label: 'Error',              spin: false, tone: 'error'     },
};

const activeStates: FloatingStatusState[] = ['loading', 'uploading', 'creating', 'updating'];
const terminalStates: FloatingStatusState[] = ['success', 'cancelled', 'error'];

export function FloatingStatusOverlay({
  state,
  message,
  detail,
  progress,
  autoDismiss = 0,
  onDismiss,
  onCancel,
  cancellable = false,
}: FloatingStatusOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [prevActive, setPrevActive] = useState(false);

  const cfg = stateConfig[state];
  const isActive = activeStates.includes(state);
  const isTerminal = terminalStates.includes(state);
  const hasProgress = typeof progress === 'number' && progress >= 0 && progress <= 100;

  useEffect(() => {
    setVisible(true);
    if (isActive) setPrevActive(true);
  }, [state, isActive]);

  useEffect(() => {
    if (isTerminal && autoDismiss > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [isTerminal, autoDismiss, onDismiss, state]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  const handleCancel = useCallback(() => {
    setVisible(false);
    onCancel?.();
  }, [onCancel]);

  if (!visible || state === 'idle') return null;

  const displayMessage = message || cfg.label;
  const showCancel = cancellable && isActive;
  const showDismiss = isTerminal;

  return (
    <div
      className={`fso-overlay fso-overlay--${cfg.tone}`}
      role="status"
      aria-live="polite"
      aria-label={displayMessage}
    >
      <div className="fso-card">
        <div className={`fso-icon-wrap fso-icon-wrap--${cfg.tone}`}>
          <span
            className={`material-symbols-outlined fso-icon ${cfg.spin ? 'fso-icon--spin' : ''}`}
            aria-hidden="true"
          >
            {cfg.icon}
          </span>
          {isActive && <span className="fso-pulse-ring" aria-hidden="true" />}
        </div>

        <div className="fso-content">
          <p className="fso-title">{displayMessage}</p>
          {detail && <p className="fso-detail">{detail}</p>}

          {(isActive || (isTerminal && prevActive)) && (
            <div className="fso-progress-track" aria-hidden={!hasProgress}>
              <div
                className={`fso-progress-bar ${!hasProgress ? 'fso-progress-bar--indeterminate' : ''}`}
                style={hasProgress ? { width: `${progress}%` } : undefined}
              />
            </div>
          )}
        </div>

        <div className="fso-actions">
          {showCancel && (
            <button
              type="button"
              className="fso-btn fso-btn--cancel"
              onClick={handleCancel}
              aria-label="Cancelar operación"
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
              <span>Cancelar</span>
            </button>
          )}
          {showDismiss && (
            <button
              type="button"
              className="fso-btn fso-btn--dismiss"
              onClick={handleDismiss}
              aria-label="Cerrar aviso"
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

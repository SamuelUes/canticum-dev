'use client';

import { useEffect, useState } from 'react';
import { listLatestWeeklyMisales, type WeeklyMisalRecord } from '../../features/plan/repository';
import { SkeletonText } from './skeleton';

function WeeklyMisalSkeletonCard() {
  return (
    <article className="weekly-misal-card is-skeleton" aria-hidden>
      <div className="weekly-misal-card-copy">
        <SkeletonText width="72%" className="weekly-misal-skeleton-line" />
        <SkeletonText width="48%" className="weekly-misal-skeleton-line" />
      </div>
      <div className="weekly-misal-skeleton-button" />
    </article>
  );
}

function formatRangeLabel(misal: WeeklyMisalRecord): string {
  const start = misal.weekStart?.trim();
  const end = misal.weekEnd?.trim();
  if (start && end) {
    return `${start} al ${end}`;
  }
  return 'Programa disponible';
}

interface WeeklyMisalStripProps {
  className?: string;
}

export function WeeklyMisalStrip({ className }: WeeklyMisalStripProps) {
  const [misales, setMisales] = useState<WeeklyMisalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      setLoading(true);
      setError(null);

      try {
        const records = await listLatestWeeklyMisales(3);
        if (!active) {
          return;
        }
        setMisales(records);
      } catch {
        if (!active) {
          return;
        }
        setMisales([]);
        setError('No fue posible cargar el plan semanal.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  if (!loading && misales.length === 0 && !error) {
    return null;
  }

  return (
    <section className={`weekly-misal-strip layout-h-margin ${className ?? ''}`.trim()} aria-label="Misales semanales">
      <div className="weekly-misal-strip-panel">
        <header className="weekly-misal-strip-header">
          <div>
            <p className="weekly-misal-kicker">Acceso rapido</p>
            <h2 className="weekly-misal-title">Misal Semanal</h2>
            <p className="weekly-misal-subtitle">Descarga el programa en PDF de las ultimas semanas.</p>
          </div>
          <button
            type="button"
            className="weekly-misal-toggle"
            aria-expanded={expanded}
            aria-controls="weekly-misal-grid"
            onClick={() => setExpanded((prev) => !prev)}
          >
            <span className="weekly-misal-toggle-text">Ver</span>
            <span className={`material-symbols-outlined song-filter-icon${expanded ? ' is-open' : ''}`} aria-hidden>keyboard_arrow_down</span>
          </button>
        </header>

        {error ? <p className="weekly-misal-error">{error}</p> : null}

        {expanded ? (
          <div id="weekly-misal-grid" className="weekly-misal-grid" role="list" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <>
                <WeeklyMisalSkeletonCard />
                <WeeklyMisalSkeletonCard />
                <WeeklyMisalSkeletonCard />
              </>
            ) : (
              misales.map((misal) => (
                <article key={misal.id} className="weekly-misal-card" role="listitem">
                  <div className="weekly-misal-card-copy">
                    <strong className="weekly-misal-item-title">{misal.title}</strong>
                    <small className="weekly-misal-item-meta">{formatRangeLabel(misal)}</small>
                  </div>

                  <a
                    href={misal.downloadUrl}
                    className="weekly-misal-download"
                    download={misal.fileName}
                    aria-label={`Descargar ${misal.title}`}
                  >
                    <span className="material-symbols-outlined weekly-misal-download-icon" aria-hidden="true">download</span>
                  </a>
                </article>
              ))
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
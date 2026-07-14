'use client';

import { useEffect, useMemo, useState } from 'react';
import { listLatestWeeklySundaySchemas, type WeeklySundaySchemaRecord } from '../../features/plan/repository';
import type { HomeSundaySchema } from '../../features/home/repository';

function formatWeekLabel(schema: WeeklySundaySchemaRecord): string {
  const start = schema.weekStart?.trim();
  const end = schema.weekEnd?.trim();
  if (start && end) {
    return `${start} al ${end}`;
  }
  return 'Esquema vigente';
}

function formatSchemaText(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface WeeklyPlanStripProps {
  className?: string;
  preloadedRecord?: HomeSundaySchema;
}

function toWeeklySundaySchemaRecord(home: HomeSundaySchema): WeeklySundaySchemaRecord {
  return {
    id: home.id,
    title: home.title,
    content: home.content,
    storagePath: home.storagePath,
    fileName: home.fileName,
    weekId: home.weekId,
    weekStart: home.weekStart,
    weekEnd: home.weekEnd,
    createdBy: null,
    createdAt: home.createdAt
  };
}

export function WeeklyPlanStrip({ className, preloadedRecord }: WeeklyPlanStripProps) {
  const [schemas, setSchemas] = useState<WeeklySundaySchemaRecord[]>(() =>
    preloadedRecord ? [toWeeklySundaySchemaRecord(preloadedRecord)] : []
  );
  const [loading, setLoading] = useState(!preloadedRecord);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (preloadedRecord) {
      setSchemas([toWeeklySundaySchemaRecord(preloadedRecord)]);
      setLoading(false);
      return;
    }

    let active = true;

    const hydrate = async () => {
      setLoading(true);
      setError(null);

      try {
        const records = await listLatestWeeklySundaySchemas(1);
        if (!active) {
          return;
        }
        setSchemas(records);
      } catch {
        if (!active) {
          return;
        }
        setSchemas([]);
        setError('No fue posible cargar el esquema del domingo.');
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
  }, [preloadedRecord]);

  const schema = schemas[0] ?? null;
  const lines = useMemo(() => (schema ? formatSchemaText(schema.content) : []), [schema]);

  if (!loading && !schema && !error) {
    return null;
  }

  return (
    <section className={`weekly-plan-strip layout-h-margin ${className ?? ''}`.trim()} aria-label="Esquema del domingo">
      <div className="weekly-plan-strip-panel">
        <header className="weekly-plan-strip-header">
          <div>
            <p className="weekly-plan-kicker">Acceso rapido</p>
            <h2 className="weekly-plan-title">Esquema del domingo</h2>
            {schema && (
              <div className="weekly-plan-card-copy">
                {/* <strong className="weekly-plan-item-title">{schema.title}</strong> */}
                <small className="weekly-plan-item-meta">{formatWeekLabel(schema)}</small>
              </div>
            )}
          </div>
           <button
            type="button"
            className="weekly-misal-toggle"
            aria-expanded={expanded}
            aria-controls="weekly-plan-body"
            onClick={() => setExpanded((prev) => !prev)}
          >
            <span className="weekly-misal-toggle-text">Ver</span>
            <span className={`material-symbols-outlined song-filter-icon${expanded ? ' is-open' : ''}`} aria-hidden>keyboard_arrow_down</span>
          </button>
        </header>

        {error ? <p className="weekly-plan-error">{error}</p> : null}

        {!loading && schema ? (
          <article id="weekly-plan-body" className={`weekly-plan-card${expanded ? '' : ' is-collapsed'}`}>
            {expanded && (
              <div className="weekly-plan-body" role="article" aria-label={schema.title}>
                {lines.length > 0 ? (
                  lines.map((line, index) => (
                    <p key={`${schema.id}-${index}`} className="weekly-plan-line">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="weekly-plan-line weekly-plan-line--empty">El esquema no contiene texto.</p>
                )}
              </div>
            )}
          </article>
        ) : (
          <article className="weekly-plan-card is-loading" aria-hidden="true">
            <div className="weekly-plan-card-copy">
              <div className="weekly-plan-skeleton-line weekly-plan-skeleton-line--title" />
              <div className="weekly-plan-skeleton-line weekly-plan-skeleton-line--meta" />
            </div>
            <div className="weekly-plan-body">
              <div className="weekly-plan-skeleton-block" />
              <div className="weekly-plan-skeleton-block" />
              <div className="weekly-plan-skeleton-block" />
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
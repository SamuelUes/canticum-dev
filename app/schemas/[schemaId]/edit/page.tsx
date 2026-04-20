'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HomeFooter } from '../../../../src/components/home/Footer';
import { Header } from '../../../../src/components/home/Header';
import { homeMockData } from '../../../../src/features/home/mockData';
import { requestDeleteSchema, requestUpdateSchema } from '../../../../src/features/schema/clientPersistence';
import { schemaMockById } from '../../../../src/features/schema/mockData';
import { getHomeText } from '../../../../src/i18n/home';
import type { Locale } from '../../../../src/types/home';

interface SchemaEditPageProps {
  params: {
    schemaId: string;
  };
}

export default function SchemaEditPage({ params }: SchemaEditPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const router = useRouter();

  const schema = useMemo(() => schemaMockById[params.schemaId], [params.schemaId]);
  const [title, setTitle] = useState(schema?.title ?? '');
  const [description, setDescription] = useState(schema?.description ?? '');
  const [liturgicalType, setLiturgicalType] = useState(schema?.liturgicalType ?? 'Litúrgico');
  const [isPublic, setIsPublic] = useState(Boolean(schema?.isPublic));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!schema) {
      router.replace(`/schemas/${params.schemaId}`);
    }
  }, [params.schemaId, router, schema]);

  if (!schema) {
    return null;
  }

  const onSave = async () => {
    setIsSaving(true);
    const result = await requestUpdateSchema(params.schemaId, {
      title,
      description,
      liturgicalType,
      isPublic
    });
    setIsSaving(false);

    if (!result.ok) {
      window.alert('No se pudo guardar el esquema.');
      return;
    }

    router.push(`/schemas/${params.schemaId}`);
  };

  const onDelete = async () => {
    const shouldDelete = window.confirm('¿Seguro que quieres eliminar este esquema?');

    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleteSchema(params.schemaId);

    if (!result.ok) {
      window.alert('No se pudo eliminar el esquema.');
      return;
    }

    router.push('/search');
  };

  return (
    <main className="home-page search-page-root">
      <div className="home-shell search-page-shell">
        <Header text={text} />

        <section className="search-results-panel">
          <header className="search-results-head">
            <h1>Editar esquema</h1>
            <p>{schema.title}</p>
          </header>

          <article className="search-generic-card schema-edit-form schema-edit-card-compact">
            <div className="schema-edit-grid-compact">
              <label>
                <span>Título</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Misa de Pentecostés" />
              </label>

              <label>
                <span>Tipo litúrgico</span>
                <input value={liturgicalType} onChange={(event) => setLiturgicalType(event.target.value)} placeholder="Ej. Litúrgico" />
              </label>
            </div>

            <label>
              <span>Descripción</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
            </label>

            <fieldset className="schema-visibility-fieldset" aria-label="visibilidad del esquema">
              <legend>Visibilidad</legend>

              <label className="schema-visibility-option">
                <input type="radio" name="schema-visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
                <div>
                  <strong>Público</strong>
                  <small>Otros usuarios podrán encontrar y ver tu esquema.</small>
                </div>
              </label>

              <label className="schema-visibility-option">
                <input type="radio" name="schema-visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
                <div>
                  <strong>Privado</strong>
                  <small>Solo tú podrás ver y gestionar este esquema.</small>
                </div>
              </label>
            </fieldset>

            <div className="schema-edit-actions schema-edit-actions-compact">
              <button type="button" className="song-premium-badge" onClick={onSave} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" className="song-premium-badge is-buy" onClick={onDelete}>
                Eliminar esquema
              </button>
            </div>
          </article>
        </section>

        <HomeFooter
          text={{
            footerKnowTitle: text.footerKnowTitle,
            footerKnowDescription: text.footerKnowDescription,
            footerCopyright: text.footerCopyright
          }}
          sections={homeMockData.footerSections}
        />
      </div>
    </main>
  );
}

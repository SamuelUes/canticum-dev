'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { HomeFooter } from '../../../../src/components/home/Footer';
import { Header } from '../../../../src/components/home/Header';
import { homeMockData } from '../../../../src/features/home/mockData';
import { fetchRepertoireDetailClient, requestDeleterepertoire, requestUpdaterepertoire } from '../../../../src/features/repertoire/clientPersistence';
import { repertoireMockById } from '../../../../src/features/repertoire/mockData';
import { getHomeText } from '../../../../src/i18n/home';
import type { Locale } from '../../../../src/types/home';

interface RepertoireEditPageProps {
  params: {
    repertoireId: string;
  };
}

export default function RepertoireEditPage({ params }: RepertoireEditPageProps) {
  const locale: Locale = 'es';
  const text = getHomeText(locale);
  const router = useRouter();

  const mockRepertoire = useMemo(() => repertoireMockById[params.repertoireId], [params.repertoireId]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found'>('loading');
  const [loadedTitle, setLoadedTitle] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [liturgicalType, setLiturgicalType] = useState('Litúrgico');
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const raw = await fetchRepertoireDetailClient(params.repertoireId);

      if (!alive) {
        return;
      }

      if (!raw) {
        if (mockRepertoire) {
          setLoadedTitle(mockRepertoire.title);
          setTitle(mockRepertoire.title);
          setDescription(mockRepertoire.description ?? '');
          setLiturgicalType(mockRepertoire.liturgicalType ?? 'Litúrgico');
          setIsPublic(Boolean(mockRepertoire.isPublic));
          setStatus('ready');
          return;
        }

        setStatus('not_found');
        return;
      }

      const nextTitle = typeof raw.title === 'string' ? raw.title : 'Repertorio';
      setLoadedTitle(nextTitle);
      setTitle(nextTitle);
      setDescription(typeof raw.description === 'string' ? raw.description : '');
      setLiturgicalType(typeof raw.liturgicalType === 'string' ? raw.liturgicalType : 'Litúrgico');
      setIsPublic(Boolean(raw.isPublic));
      setStatus('ready');
    };

    void load();

    return () => {
      alive = false;
    };
  }, [params.repertoireId, mockRepertoire]);

  useEffect(() => {
    if (status === 'not_found') {
      router.replace(`/repertoires/${params.repertoireId}`);
    }
  }, [params.repertoireId, router, status]);

  if (status !== 'ready') {
    return null;
  }

  const onSave = async () => {
    setIsSaving(true);
    const result = await requestUpdaterepertoire(params.repertoireId, {
      title,
      description,
      liturgicalType,
      isPublic
    });
    setIsSaving(false);

    if (!result.ok) {
      window.alert('No se pudo guardar el repertorio.');
      return;
    }

    router.push(`/repertoires/${params.repertoireId}`);
  };

  const onDelete = async () => {
    const shouldDelete = window.confirm('¿Seguro que quieres eliminar este repertorio?');

    if (!shouldDelete) {
      return;
    }

    const result = await requestDeleterepertoire(params.repertoireId);

    if (!result.ok) {
      window.alert('No se pudo eliminar el repertorio.');
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
            <h1>Editar repertorio</h1>
            <p>{loadedTitle}</p>
          </header>

          <article className="search-generic-card repertoire-edit-form repertoire-edit-card-compact">
            <div className="repertoire-edit-grid-compact">
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

            <fieldset className="repertoire-visibility-fieldset" aria-label="visibilidad del repertorio">
              <legend>Visibilidad</legend>

              <label className="repertoire-visibility-option">
                <input type="radio" name="repertoire-visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
                <div>
                  <strong>Público</strong>
                  <small>Otros usuarios podrán encontrar y ver tu repertorio.</small>
                </div>
              </label>

              <label className="repertoire-visibility-option">
                <input type="radio" name="repertoire-visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
                <div>
                  <strong>Privado</strong>
                  <small>Solo tú podrás ver y gestionar este repertorio.</small>
                </div>
              </label>
            </fieldset>

            <div className="repertoire-edit-actions repertoire-edit-actions-compact">
              <button type="button" className="song-premium-badge" onClick={onSave} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" className="song-premium-badge is-buy" onClick={onDelete}>
                Eliminar repertorio
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

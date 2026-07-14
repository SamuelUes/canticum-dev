'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../features/auth/repository';
import { uploadWeeklyMisal, uploadWeeklySundaySchema } from '../../features/plan/repository';
import { LoadingBubble } from '../ui/LoadingBubble';

export function PlanAdminWorkspace() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [schemaTitle, setSchemaTitle] = useState('');
  const [schemaContent, setSchemaContent] = useState('');
  const [schemaSubmitting, setSchemaSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = isAdminUser(user);

  if (loading) {
    return <LoadingBubble isLoading={true} message="Cargando permisos…" showDelay={0} />;
  }

  if (!canManage) {
    return (
      <section className="create-page-layout misal-admin-layout">
        <header className="create-page-header">
          <h1>Programa semanal de misas</h1>
          <p>Solo admin pueden subir misales.</p>
        </header>

        <div className="misal-admin-locked">
          <strong>Acceso restringido</strong>
          <p>No tienes permisos para gestionar los misales semanales.</p>
          <button type="button" className="create-form-submit" onClick={() => router.push('/')}>
            Volver al inicio
          </button>
        </div>
      </section>
    );
  }

  const canSubmit = title.trim().length > 0 && file !== null && !submitting;

  const clearForm = () => {
    setTitle('');
    setFile(null);
    setFileInputKey((value) => value + 1);
  };

  const clearSchemaForm = () => {
    setSchemaTitle('');
    setSchemaContent('');
  };

  const handleClear = () => {
    clearForm();
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSchemaClear = () => {
    clearSchemaForm();
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || !file) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    const result = await uploadWeeklyMisal({
      title,
      file
    });

    if (!result.ok) {
      setErrorMessage(result.error ?? 'No se pudo subir el misal.');
      setSubmitting(false);
      return;
    }

    setSuccessMessage('Misal subido correctamente.');
    clearForm();
    setSubmitting(false);
  };

  const handleSchemaSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const canSchemaSubmit = schemaTitle.trim().length > 0 && schemaContent.trim().length > 0 && !schemaSubmitting;
    if (!canSchemaSubmit) {
      return;
    }

    setSchemaSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await uploadWeeklySundaySchema({
        title: schemaTitle,
        content: schemaContent
      });

      if (!result.ok) {
        setErrorMessage(result.error ?? 'No se pudo subir el esquema del domingo.');
        return;
      }

      setSuccessMessage('Esquema del domingo subido correctamente.');
      clearSchemaForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo subir el esquema del domingo.');
    } finally {
      setSchemaSubmitting(false);
    }
  };

  return (
    <section className="create-page-layout misal-admin-layout">
      <LoadingBubble isLoading={submitting || schemaSubmitting} message={schemaSubmitting ? 'Guardando esquema…' : 'Subiendo misal…'} />
      <header className="create-page-header">
        <h1>Programa semanal de misas</h1>
        <p>Sube un PDF con el título visible para que aparezca en el acceso rápido del home.</p>
      </header>

      <form className="create-repertoire-form misal-admin-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="create-form-grid">
          <label className="create-form-field">
            <span>Título *</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej: Misal Semanal"
              maxLength={120}
              required
              disabled={submitting}
            />
          </label>

          <div className="create-form-field">
            <span>Archivo PDF *</span>
            <label className="misal-file-dropzone" htmlFor="misal-pdf-upload">
              <input
                key={fileInputKey}
                id="misal-pdf-upload"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={submitting}
              />
              <strong>{file ? file.name : 'Seleccionar PDF'}</strong>
              <small>Se guarda en la nube.</small>
            </label>
          </div>
        </div>

        {errorMessage ? <p className="create-form-error">{errorMessage}</p> : null}
        {successMessage ? <p className="create-form-success">{successMessage}</p> : null}

        <div className="create-form-actions">
          <button
            type="button"
            className="create-form-cancel"
            onClick={handleClear}
            disabled={submitting}
          >
            Limpiar
          </button>

          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            {submitting ? 'Subiendo...' : 'Subir misal'}
          </button>
        </div>
      </form>

      <form className="create-repertoire-form misal-admin-form weekly-schema-form" onSubmit={(event) => void handleSchemaSubmit(event)}>
        <div className="create-form-grid weekly-schema-grid">
          <label className="create-form-field">
            <span>Título del esquema *</span>
            <input
              type="text"
              value={schemaTitle}
              onChange={(event) => setSchemaTitle(event.target.value)}
              placeholder="Ej: Esquema del domingo"
              maxLength={120}
              required
              disabled={schemaSubmitting}
            />
          </label>

          <label className="create-form-field weekly-schema-field">
            <span>Contenido del esquema *</span>
            <textarea
              value={schemaContent}
              onChange={(event) => setSchemaContent(event.target.value)}
              placeholder="Pega aquí el texto del esquema del domingo..."
              rows={8}
              required
              disabled={schemaSubmitting}
            />
          </label>
        </div>

        <p className="weekly-schema-hint">Se guarda como texto plano y se muestra a la derecha del misal en la portada.</p>

        <div className="create-form-actions">
          <button
            type="button"
            className="create-form-cancel"
            onClick={handleSchemaClear}
            disabled={schemaSubmitting}
          >
            Limpiar esquema
          </button>

          <button type="submit" className="create-form-submit" disabled={schemaSubmitting || schemaTitle.trim().length === 0 || schemaContent.trim().length === 0}>
            {schemaSubmitting ? 'Subiendo esquema...' : 'Subir esquema del domingo'}
          </button>
        </div>
      </form>
    </section>
  );
}

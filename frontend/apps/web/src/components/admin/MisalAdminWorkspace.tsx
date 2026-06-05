'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { uploadWeeklyMisal } from '../../features/misales/repository';

function isMisalManager(role?: string): boolean {
  return role === 'admin' || role === 'editor';
}

export function MisalAdminWorkspace() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = useMemo(() => isMisalManager(user?.role), [user?.role]);

  if (loading) {
    return (
      <section className="create-page-layout misal-admin-layout">
        <header className="create-page-header">
          <h1>Programa semanal de misas</h1>
          <p>Cargando permisos...</p>
        </header>
      </section>
    );
  }

  if (!canManage) {
    return (
      <section className="create-page-layout misal-admin-layout">
        <header className="create-page-header">
          <h1>Programa semanal de misas</h1>
          <p>Solo admin o moderador pueden subir misales.</p>
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

  const handleClear = () => {
    clearForm();
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

  return (
    <section className="create-page-layout misal-admin-layout">
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
    </section>
  );
}

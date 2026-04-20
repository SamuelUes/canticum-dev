'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { requestCreateSchema, type CreateSchemaPayload } from '../../features/schema/clientPersistence';
import { getSongTitleById } from '../../features/song/repository';
import type { SongRef } from '../../types/schema';

const LITURGICAL_TYPES = [
  'Misa Dominical',
  'Misa de Semana',
  'Adoración',
  'Hora Santa',
  'Celebración Mariana',
  'Funeral',
  'Boda',
  'Bautizo',
  'Confirmación',
  'Primera Comunión',
  'Cuaresma',
  'Adviento',
  'Navidad',
  'Pascua',
  'General'
];

export function CreateSchemaWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [liturgicalType, setLiturgicalType] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [songIdInput, setSongIdInput] = useState('');
  const [addedSongs, setAddedSongs] = useState<SongRef[]>([]);
  const [addingSong, setAddingSong] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleAddSong = useCallback(async () => {
    const id = songIdInput.trim();
    if (!id || addingSong) return;
    if (addedSongs.some((s) => s.id === id)) {
      setErrorMessage('Esa canción ya fue agregada.');
      return;
    }

    setAddingSong(true);
    setErrorMessage('');

    const songRef = await getSongTitleById(id);

    if (!songRef) {
      setErrorMessage(`No se encontró la canción con ID "${id}".`);
      setAddingSong(false);
      return;
    }

    setAddedSongs((prev) => [...prev, songRef]);
    setSongIdInput('');
    setAddingSong(false);
  }, [songIdInput, addingSong, addedSongs]);

  const handleRemoveSong = (songId: string) => {
    setAddedSongs((prev) => prev.filter((s) => s.id !== songId));
  };

  const handleMoveSong = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= addedSongs.length) return;
    setAddedSongs((prev) => {
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    const payload: CreateSchemaPayload = {
      title: title.trim(),
      isPublic
    };

    if (liturgicalType) payload.liturgicalType = liturgicalType;
    if (addedSongs.length > 0) payload.songIds = addedSongs.map((s) => s.id);

    const result = await requestCreateSchema(payload);

    setSubmitting(false);

    if (result.ok) {
      setSuccessMessage('¡Esquema creado exitosamente!');
      if (result.schemaId) {
        setTimeout(() => router.push(`/schemas/${result.schemaId}`), 1200);
      }
    } else {
      const messages: Record<string, string> = {
        plan_limit: result.message ?? 'Has alcanzado el límite de esquemas en tu plan.',
        forbidden: 'No tienes permisos para crear esquemas.',
        unauthorized: 'Debes iniciar sesión.',
        network: 'Error de red. Intenta de nuevo.',
        unknown: 'Ocurrió un error inesperado.'
      };
      setErrorMessage(messages[result.reason ?? 'unknown'] ?? messages.unknown);
    }
  };

  return (
    <section className="create-page-layout layout-h-margin">
      <header className="create-page-header">
        <h1>Crear Esquema Litúrgico</h1>
        <p>Organiza canciones para tu celebración. El campo título es obligatorio.</p>
      </header>

      <form className="create-schema-form" onSubmit={(e) => void handleSubmit(e)}>
        {errorMessage && <p className="create-form-error">{errorMessage}</p>}
        {successMessage && <p className="create-form-success">{successMessage}</p>}

        <label className="create-form-field">
          <span>Título del Esquema *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Misa del Domingo III de Cuaresma"
            required
          />
        </label>

        <label className="create-form-field">
          <span>Tipo Litúrgico</span>
          <select value={liturgicalType} onChange={(e) => setLiturgicalType(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {LITURGICAL_TYPES.map((lt) => (
              <option key={lt} value={lt}>{lt}</option>
            ))}
          </select>
        </label>

        <fieldset className="create-visibility-fieldset">
          <legend>Visibilidad</legend>
          <label className="create-visibility-option">
            <input
              type="radio"
              name="visibility"
              checked={!isPublic}
              onChange={() => setIsPublic(false)}
            />
            <div>
              <strong>Privado</strong>
              <small>Solo tú puedes verlo</small>
            </div>
          </label>
          <label className="create-visibility-option">
            <input
              type="radio"
              name="visibility"
              checked={isPublic}
              onChange={() => setIsPublic(true)}
            />
            <div>
              <strong>Público</strong>
              <small>Visible para todos los usuarios</small>
            </div>
          </label>
        </fieldset>

        <div className="create-schema-songs-section">
          <h3>Canciones del Esquema</h3>
          <p className="create-form-hint-inline">Agrega canciones por su ID. Puedes reordenarlas después.</p>

          <div className="create-schema-add-row">
            <input
              type="text"
              value={songIdInput}
              onChange={(e) => setSongIdInput(e.target.value)}
              placeholder="ID de la canción"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddSong();
                }
              }}
            />
            <button
              type="button"
              className="create-schema-add-btn"
              disabled={!songIdInput.trim() || addingSong}
              onClick={() => void handleAddSong()}
            >
              {addingSong ? '...' : '+ Agregar'}
            </button>
          </div>

          {addedSongs.length > 0 && (
            <ol className="create-schema-song-list">
              {addedSongs.map((song, index) => (
                <li key={song.id} className="create-schema-song-item">
                  <span className="create-schema-song-num">{index + 1}</span>
                  <div className="create-schema-song-info">
                    <strong>{song.title}</strong>
                    {song.artistName && <small>{song.artistName}</small>}
                  </div>
                  <div className="create-schema-song-actions">
                    <button
                      type="button"
                      aria-label="Mover arriba"
                      disabled={index === 0}
                      onClick={() => handleMoveSong(index, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="Mover abajo"
                      disabled={index === addedSongs.length - 1}
                      onClick={() => handleMoveSong(index, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      aria-label="Quitar canción"
                      className="create-schema-remove-btn"
                      onClick={() => handleRemoveSong(song.id)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {addedSongs.length === 0 && (
            <p className="create-form-empty">Aún no has agregado canciones a este esquema.</p>
          )}
        </div>

        <div className="create-form-actions">
          <button type="button" className="create-form-cancel" onClick={() => router.back()}>
            Cancelar
          </button>
          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            {submitting ? 'Creando...' : 'Crear Esquema'}
          </button>
        </div>

        {user && (
          <p className="create-form-hint">
            El esquema será asociado a tu cuenta ({user.email}).
          </p>
        )}
      </form>
    </section>
  );
}

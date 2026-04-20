'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { requestCreateSong, type CreateSongPayload } from '../../features/song/clientPersistence';

const LITURGICAL_USES = [
  'Entrada',
  'Acto Penitencial',
  'Gloria',
  'Salmo Responsorial',
  'Aleluya',
  'Ofertorio',
  'Santo',
  'Cordero de Dios',
  'Comunión',
  'Acción de Gracias',
  'Salida',
  'Adoración',
  'Mariana',
  'Cuaresma',
  'Adviento',
  'Navidad',
  'Pascua',
  'General'
];

const NOTATION_TYPES = ['Cifrado', 'Partitura', 'Tablatura', 'Ninguno'];

export function CreateSongWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [year, setYear] = useState('');
  const [liturgicalUse, setLiturgicalUse] = useState('');
  const [tone, setTone] = useState('');
  const [notationType, setNotationType] = useState('');
  const [audioReferenceUrl, setAudioReferenceUrl] = useState('');
  const [lyrics, setLyrics] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canSubmit = title.trim().length > 0 && lyrics.trim().length > 0 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    const payload: CreateSongPayload = {
      title: title.trim(),
      lyrics: lyrics.trim()
    };

    if (artistName.trim()) payload.artistName = artistName.trim();
    if (year.trim()) payload.year = Number(year.trim()) || undefined;
    if (liturgicalUse) payload.liturgicalUse = liturgicalUse;
    if (tone.trim()) payload.tone = tone.trim();
    if (notationType) payload.notationType = notationType;
    if (audioReferenceUrl.trim()) payload.audioReferenceUrl = audioReferenceUrl.trim();

    const result = await requestCreateSong(payload);

    setSubmitting(false);

    if (result.ok) {
      setSuccessMessage('¡Canción creada exitosamente!');
      if (result.songId) {
        setTimeout(() => router.push(`/canciones/${result.songId}`), 1200);
      }
    } else {
      const messages: Record<string, string> = {
        plan_limit: result.message ?? 'Has alcanzado el límite de tu plan.',
        forbidden: 'No tienes permisos para crear canciones.',
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
        <h1>Subir Canción</h1>
        <p>Completa los datos de la canción. Los campos marcados con * son obligatorios.</p>
      </header>

      <form className="create-song-form" onSubmit={(e) => void handleSubmit(e)}>
        {errorMessage && <p className="create-form-error">{errorMessage}</p>}
        {successMessage && <p className="create-form-success">{successMessage}</p>}

        <div className="create-form-grid">
          <label className="create-form-field">
            <span>Título *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre de la canción"
              required
            />
          </label>

          <label className="create-form-field">
            <span>Artista / Autor</span>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Nombre del artista o autor"
            />
          </label>

          <label className="create-form-field">
            <span>Año</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Ej: 2024"
              min={1900}
              max={2100}
            />
          </label>

          <label className="create-form-field">
            <span>Uso Litúrgico</span>
            <select value={liturgicalUse} onChange={(e) => setLiturgicalUse(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {LITURGICAL_USES.map((use) => (
                <option key={use} value={use}>{use}</option>
              ))}
            </select>
          </label>

          <label className="create-form-field">
            <span>Tono</span>
            <input
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Ej: Do Mayor, Em, G"
            />
          </label>

          <label className="create-form-field">
            <span>Tipo de Notación</span>
            <select value={notationType} onChange={(e) => setNotationType(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {NOTATION_TYPES.map((nt) => (
                <option key={nt} value={nt}>{nt}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="create-form-field">
          <span>URL de Audio de Referencia</span>
          <input
            type="url"
            value={audioReferenceUrl}
            onChange={(e) => setAudioReferenceUrl(e.target.value)}
            placeholder="https://ejemplo.com/audio.mp3"
          />
        </label>

        <label className="create-form-field">
          <span>Letra *</span>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Escribe o pega la letra de la canción aquí..."
            rows={14}
            required
          />
        </label>

        <div className="create-form-actions">
          <button type="button" className="create-form-cancel" onClick={() => router.back()}>
            Cancelar
          </button>
          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            {submitting ? 'Enviando...' : 'Crear Canción'}
          </button>
        </div>

        {user && (
          <p className="create-form-hint">
            La canción será creada como borrador y asociada a tu cuenta ({user.email}).
            Un curador la revisará antes de publicarla.
          </p>
        )}
      </form>
    </section>
  );
}

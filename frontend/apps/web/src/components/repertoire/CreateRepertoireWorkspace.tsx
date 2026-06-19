'use client';

import { collection, doc } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import {
  requestCreaterepertoire,
  requestSearchRepertoireSongs,
  type CreaterepertoirePayload
} from '../../features/repertoire/clientPersistence';
import { prepareCoverImageFileOriginalSize, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { CropperModal } from '../ui/CropperModal';
import type { RepertoireSongSearchOption, SongRef } from '../../types/repertoire';
import { db } from '../../services/firebase';

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

function generateFirestoreDocId(collectionPath: string): string {
  if (!db) {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return doc(collection(db, collectionPath)).id;
}

export function CreaterepertoireWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  const [repertoireDocId, setRepertoireDocId] = useState<string>(() => generateFirestoreDocId('repertoires'));
  const [title, setTitle] = useState('');
  const [liturgicalType, setLiturgicalType] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [songSearchInput, setSongSearchInput] = useState('');
  const [searchOptions, setSearchOptions] = useState<RepertoireSongSearchOption[]>([]);
  const [isSearchingSongs, setIsSearchingSongs] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedOptionIndex, setHighlightedOptionIndex] = useState(-1);
  const [addedSongs, setAddedSongs] = useState<SongRef[]>([]);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const {
    blobUrl: coverPreviewUrl,
    setBlobFromFile: setCoverPreviewFromFile,
    clearBlobUrl: clearCoverPreviewUrl
  } = useBlobUrl();
  const [coverError, setCoverError] = useState('');
  const [coverPreparing, setCoverPreparing] = useState(false);

  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = title.trim().length > 0 && !submitting && !coverPreparing;

  const hasQuery = songSearchInput.trim().length > 0;

  const highlightableOptions = useMemo(
    () => searchOptions.filter((option) => !addedSongs.some((song) => song.id === option.songId)),
    [searchOptions, addedSongs]
  );

  const handleSelectSongOption = useCallback((option: RepertoireSongSearchOption) => {
    if (addedSongs.some((song) => song.id === option.songId)) {
      setErrorMessage('Esa canción ya fue agregada.');
      return;
    }

    setErrorMessage('');

    setAddedSongs((prev) => [
      ...prev,
      {
        id: option.songId,
        title: option.title,
        artistName: option.artistName ?? option.songArtistName ?? undefined,
        versionId: option.versionId ?? undefined,
        versionName: option.versionName ?? undefined,
        instrumentName: option.instrumentName ?? undefined,
        matchType: option.matchType
      }
    ]);

    setSongSearchInput('');
    setSearchOptions([]);
    setHighlightedOptionIndex(-1);
    setIsSearchOpen(false);
  }, [addedSongs]);

  useEffect(() => {
    const query = songSearchInput.trim();

    if (!query) {
      setSearchOptions([]);
      setIsSearchingSongs(false);
      setHighlightedOptionIndex(-1);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingSongs(true);
      const options = await requestSearchRepertoireSongs(query, 12);
      setSearchOptions(options);
      setHighlightedOptionIndex(options.length > 0 ? 0 : -1);
      setIsSearchingSongs(false);
      setIsSearchOpen(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [songSearchInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchWrapRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !searchWrapRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCoverSelection = async (file: File | null) => {
    setCoverError('');

    if (!file) {
      setCoverFile(null);
      clearCoverPreviewUrl();
      setCoverPreparing(false);
      return;
    }

    setCoverPreparing(true);

    const prepared = await prepareCoverImageFileOriginalSize(file);
    if (!prepared.ok) {
      setCoverFile(null);
      clearCoverPreviewUrl();
      setCoverError(prepared.error);
      setCoverPreparing(false);
      return;
    }

    setImageToCrop(URL.createObjectURL(prepared.file));
    setShowCropper(true);
    setCoverPreparing(false);
  };

  const handleCropConfirm = (croppedFile: File) => {
    setCoverFile(croppedFile);
    setCoverPreviewFromFile(croppedFile);
    setShowCropper(false);
    setImageToCrop('');
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setImageToCrop('');
  };

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

    const payload: CreaterepertoirePayload = {
      title: title.trim(),
      repertoireDocId,
      isPublic
    };

    if (liturgicalType) payload.liturgicalType = liturgicalType;
    if (addedSongs.length > 0) {
      payload.songIds = addedSongs.map((s) => s.id);
      payload.songs = addedSongs.map((s) => ({
        songId: s.id,
        ...(s.versionId ? { versionId: s.versionId } : {})
      }));
    }

    if (coverFile) {
      const coverResult = await uploadCoverImage({
        file: coverFile,
        entity: 'repertoires',
        entityId: repertoireDocId,
        filenameBase: title.trim() || 'repertoire-cover'
      });

      if (!coverResult.ok || !coverResult.url) {
        setSubmitting(false);
        setErrorMessage(coverResult.error ?? 'No se pudo subir la portada.');
        return;
      }

      payload.coverImageUrl = coverResult.url;
    }

    const result = await requestCreaterepertoire(payload);

    setSubmitting(false);

    if (result.ok) {
      setSuccessMessage('¡Repertorio creado exitosamente!');
      if (result.repertoireId) {
        setTimeout(() => router.push(`/repertoires/${result.repertoireId}`), 1200);
      }
      setCoverFile(null);
      clearCoverPreviewUrl();
      setCoverError('');
      setCoverPreparing(false);
      setRepertoireDocId(generateFirestoreDocId('repertoires'));
    } else {
      const messages: Record<string, string> = {
        plan_limit: result.message ?? 'Has alcanzado el límite de repertorios en tu plan.',
        forbidden: 'No tienes permisos para crear repertorios.',
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
        <h1>Crear Repertorio Litúrgico</h1>
        <p>Organiza canciones para tu celebración. El campo título es obligatorio.</p>
      </header>

      <form className="create-repertoire-form" onSubmit={(e) => void handleSubmit(e)}>
        {errorMessage && <p className="create-form-error">{errorMessage}</p>}
        {successMessage && <p className="create-form-success">{successMessage}</p>}

        <label className="create-form-field">
          <span>Título del repertorio *</span>
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

        <div className="create-cover-field">
          <span>Portada (opcional)</span>
          <div className="create-cover-upload-row">
            <input
              id="repertoire-cover-upload"
              className="create-cover-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(event) => void handleCoverSelection(event.target.files?.[0] ?? null)}
              disabled={submitting || coverPreparing}
            />
            <label htmlFor="repertoire-cover-upload" className="create-cover-upload-button">
              {coverPreparing ? 'Procesando...' : 'Seleccionar imagen'}
            </label>
            <span className="create-cover-upload-meta">
              Se guarda en 480x480 • mínimo 120x120 • máx 5MB
            </span>
          </div>

          {coverPreviewUrl && (
            <div className="create-cover-preview">
              <Image
                src={coverPreviewUrl}
                alt="Previsualización de portada del repertorio"
                width={88}
                height={88}
                unoptimized={coverPreviewUrl.startsWith('blob:') || coverPreviewUrl.startsWith('data:')}
              />
              <div className="create-cover-preview-actions">
                <span>{coverFile?.name ?? 'portada.jpg'}</span>
                <button
                  type="button"
                  className="create-form-cancel"
                  onClick={() => void handleCoverSelection(null)}
                  disabled={submitting || coverPreparing}
                >
                  Quitar imagen
                </button>
              </div>
            </div>
          )}

          {coverError && <p className="create-form-error">{coverError}</p>}
        </div>

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

        <div className="create-repertoire-songs-section">
          <h3>Canciones del repertorio</h3>
          <p className="create-form-hint-inline">Busca por nombre de canción, artista, ID de canción o ID de versión.</p>

          <div className="create-repertoire-search-wrap" ref={searchWrapRef}>
            <div className="create-repertoire-add-row">
              <input
                type="text"
                value={songSearchInput}
                onChange={(e) => {
                  setSongSearchInput(e.target.value);
                  if (!isSearchOpen) {
                    setIsSearchOpen(true);
                  }
                }}
                onFocus={() => {
                  if (hasQuery || searchOptions.length > 0) {
                    setIsSearchOpen(true);
                  }
                }}
                placeholder="Buscar canción, versión, artista o ID"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!isSearchOpen) {
                      setIsSearchOpen(true);
                      return;
                    }
                    if (highlightableOptions.length > 0) {
                      setHighlightedOptionIndex((prev) => Math.min(prev + 1, highlightableOptions.length - 1));
                    }
                    return;
                  }

                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (highlightableOptions.length > 0) {
                      setHighlightedOptionIndex((prev) => Math.max(prev - 1, 0));
                    }
                    return;
                  }

                  if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                    return;
                  }

                  if (e.key === 'Enter') {
                    e.preventDefault();

                    const selected = highlightableOptions[highlightedOptionIndex] ?? highlightableOptions[0];
                    if (selected) {
                      handleSelectSongOption(selected);
                    }
                  }
                }}
              />
              <button
                type="button"
                className="create-repertoire-add-btn"
                disabled={!highlightableOptions.length}
                onClick={() => {
                  const selected = highlightableOptions[highlightedOptionIndex] ?? highlightableOptions[0];
                  if (selected) {
                    handleSelectSongOption(selected);
                  }
                }}
              >
                + Agregar
              </button>
            </div>

            {isSearchOpen && (hasQuery || searchOptions.length > 0) && (
              <div className="create-repertoire-search-dropdown">
                {isSearchingSongs && <p className="create-repertoire-search-status">Buscando canciones...</p>}

                {!isSearchingSongs && highlightableOptions.length === 0 && (
                  <p className="create-repertoire-search-status">No se encontraron coincidencias.</p>
                )}

                {!isSearchingSongs && highlightableOptions.length > 0 && (
                  <ul className="create-repertoire-search-list">
                    {highlightableOptions.map((option, index) => {
                      const artistName = option.artistName ?? option.songArtistName ?? 'Artista desconocido';
                      const versionLine = option.matchType === 'version'
                        ? [option.versionName, option.instrumentName].filter(Boolean).join(' · ')
                        : null;

                      return (
                        <li key={`${option.songId}-${option.versionId ?? 'song'}-${index}`}>
                          <button
                            type="button"
                            className={`create-repertoire-search-option${highlightedOptionIndex === index ? ' is-highlighted' : ''}`}
                            onMouseEnter={() => setHighlightedOptionIndex(index)}
                            onClick={() => handleSelectSongOption(option)}
                          >
                            <span className="create-repertoire-search-main">
                              <strong>{option.title}</strong>
                              <small>{artistName}</small>
                              {versionLine && <small>{versionLine}</small>}
                            </span>
                            <span className="create-repertoire-search-meta">
                              {option.matchType === 'version' ? `Versión #${option.versionId ?? ''}` : `Canción #${option.songId}`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {addedSongs.length > 0 && (
            <ol className="create-repertoire-song-list">
              {addedSongs.map((song, index) => (
                <li key={song.id} className="create-repertoire-song-item">
                  <span className="create-repertoire-song-num">{index + 1}</span>
                  <div className="create-repertoire-song-info">
                    <strong>{song.title}</strong>
                    {song.artistName && <small>{song.artistName}</small>}
                    {song.versionName && (
                      <small>{[song.versionName, song.instrumentName].filter(Boolean).join(' · ')}</small>
                    )}
                  </div>
                  <div className="create-repertoire-song-actions">
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
                      className="create-repertoire-remove-btn"
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
            <p className="create-form-empty">Aún no has agregado canciones a este repertorio.</p>
          )}
        </div>

        <div className="create-form-actions">
          <button type="button" className="create-form-cancel" onClick={() => router.back()}>
            Cancelar
          </button>
          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            {submitting ? 'Creando...' : 'Crear repertorio'}
          </button>
        </div>

        {user && (
          <p className="create-form-hint">
            El repertorio será asociado a tu cuenta ({user.email}).
          </p>
        )}
      </form>

      <CropperModal
        isOpen={showCropper}
        imageSrc={imageToCrop}
        aspectRatio={1}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </section>
  );
}

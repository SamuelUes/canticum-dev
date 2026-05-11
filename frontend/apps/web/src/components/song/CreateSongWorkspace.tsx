'use client';

import { collection, doc } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchSongsByArtist, type ArtistSongLookup } from '../../features/artist/repository';
import {
  requestCreateSong,
  type CreateSongPayload,
  type CreateSongPayloadVersion
} from '../../features/song/clientPersistence';
import { uploadVersionAsset } from '../../features/song/versionAssetUpload';
import { prepareCoverImageFile, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { db } from '../../services/firebase';
import { ArtistAutocomplete, type ArtistOption } from '../shared/ArtistAutocomplete';

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

type WorkspaceMode = 'new' | 'addVersion';

interface DraftVersion {
  localId: string;
  /** Pre-generated Firestore version doc id (used for Storage paths and backend). */
  docId: string;
  versionName: string;
  instrumentName: string;
  artistOption: ArtistOption | null;
  artistText: string;
  isOwnVersion: boolean;
  tone: string;
  notationType: string;
  audioFile: File | null;
  audioReferenceUrl: string;
  lyrics: string;
  lyricsFile: File | null;
  sheetFile: File | null;
}

function generateFirestoreDocId(collectionPath: string): string {
  // Uses Firestore's auto-id generator without writing to the database.
  if (!db) {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return doc(collection(db, collectionPath)).id;
}

function createEmptyVersion(seed: number, songDocId: string): DraftVersion {
  return {
    localId: `version-${seed}-${Date.now()}`,
    docId: generateFirestoreDocId(`songs/${songDocId}/versions`),
    versionName: `Versión ${seed}`,
    instrumentName: 'Letra',
    artistOption: null,
    artistText: '',
    isOwnVersion: true,
    tone: '',
    notationType: '',
    audioFile: null,
    audioReferenceUrl: '',
    lyrics: '',
    lyricsFile: null,
    sheetFile: null
  };
}

export function CreateSongWorkspace() {
  const router = useRouter();
  const { user } = useAuth();

  // Mode + target IDs.
  const [mode, setMode] = useState<WorkspaceMode>('new');
  const [songDocId, setSongDocId] = useState<string>(() => generateFirestoreDocId('songs'));

  // New-song fields.
  const [title, setTitle] = useState('');
  const [songArtistOption, setSongArtistOption] = useState<ArtistOption | null>(null);
  const [songArtistText, setSongArtistText] = useState('');
  const [year, setYear] = useState('');
  const [liturgicalUse, setLiturgicalUse] = useState('');

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverError, setCoverError] = useState('');
  const [coverPreparing, setCoverPreparing] = useState(false);

  // Add-version fields.
  const [existingArtistOption, setExistingArtistOption] = useState<ArtistOption | null>(null);
  const [existingArtistSongs, setExistingArtistSongs] = useState<ArtistSongLookup[]>([]);
  const [loadingArtistSongs, setLoadingArtistSongs] = useState(false);
  const [selectedExistingSongId, setSelectedExistingSongId] = useState<string>('');

  const [versions, setVersions] = useState<DraftVersion[]>(() => [createEmptyVersion(1, songDocId)]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ── Effects ──

  // When artist changes in addVersion mode, load that artist's songs.
  useEffect(() => {
    if (mode !== 'addVersion') {
      return;
    }
    const artistId = existingArtistOption?.id;
    if (!artistId) {
      setExistingArtistSongs([]);
      setSelectedExistingSongId('');
      return;
    }
    let cancelled = false;
    setLoadingArtistSongs(true);
    fetchSongsByArtist(artistId)
      .then((items) => {
        if (cancelled) return;
        setExistingArtistSongs(items);
        // Auto-select if only one match.
        if (items.length === 1 && items[0].songId) {
          setSelectedExistingSongId(items[0].songId);
        } else {
          setSelectedExistingSongId('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingArtistSongs(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, existingArtistOption?.id]);

  // When mode switches, refresh the active songDocId so we don't carry stale Storage paths.
  useEffect(() => {
    if (mode === 'new') {
      const fresh = generateFirestoreDocId('songs');
      setSongDocId(fresh);
      setVersions((prev) => prev.map((v, i) => ({
        ...v,
        docId: generateFirestoreDocId(`songs/${fresh}/versions`),
        versionName: v.versionName || `Versión ${i + 1}`
      })));
      setCoverFile(null);
      setCoverPreviewUrl('');
      setCoverError('');
      setCoverPreparing(false);
    }
    // For addVersion, songDocId follows selectedExistingSongId (see below).
  }, [mode]);

  // In addVersion mode, the songDocId equals the selected existing song.
  useEffect(() => {
    if (mode !== 'addVersion') return;
    if (!selectedExistingSongId) return;
    setSongDocId(selectedExistingSongId);
    setVersions((prev) => prev.map((v) => ({
      ...v,
      docId: generateFirestoreDocId(`songs/${selectedExistingSongId}/versions`)
    })));
  }, [mode, selectedExistingSongId]);

  useEffect(() => () => {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
  }, [coverPreviewUrl]);

  // ── Validation ──

  const hasSongArtist = mode === 'new'
    ? Boolean(songArtistOption?.id || songArtistText.trim())
    : Boolean(existingArtistOption?.id);
  const hasTargetSong = mode === 'new' ? title.trim().length > 0 : Boolean(selectedExistingSongId);
  const hasValidVersions = versions.length > 0
    && versions.every((version) => {
      const hasVersionArtist = version.isOwnVersion || Boolean(version.artistOption?.id || version.artistText.trim());
      const hasAudio = Boolean(version.audioFile || version.audioReferenceUrl.trim());
      const hasLyricsContent = Boolean(version.lyrics.trim() || version.lyricsFile);
      return Boolean(
        version.versionName.trim() &&
        version.instrumentName.trim() &&
        hasVersionArtist &&
        hasAudio &&
        hasLyricsContent
      );
    });

  const canSubmit = hasTargetSong && hasSongArtist && hasValidVersions && !submitting && !coverPreparing;

  const updateVersion = (localId: string, update: Partial<DraftVersion>) => {
    setVersions((prev) => prev.map((version) => (
      version.localId === localId ? { ...version, ...update } : version
    )));
  };

  const handleCoverSelection = async (file: File | null) => {
    setCoverError('');
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    if (!file) {
      setCoverFile(null);
      setCoverPreviewUrl('');
      return;
    }

    setCoverPreparing(true);

    const prepared = await prepareCoverImageFile(file);
    if (!prepared.ok) {
      setCoverFile(null);
      setCoverPreviewUrl('');
      setCoverError(prepared.error);
      setCoverPreparing(false);
      return;
    }

    setCoverFile(prepared.file);
    setCoverPreviewUrl(URL.createObjectURL(prepared.file));
    setCoverPreparing(false);
  };

  const removeVersion = (localId: string) => {
    setVersions((prev) => (prev.length > 1 ? prev.filter((version) => version.localId !== localId) : prev));
  };

  const addVersion = () => {
    setVersions((prev) => [...prev, createEmptyVersion(prev.length + 1, songDocId)]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!user?.uid) {
      setSubmitting(false);
      setErrorMessage('Debes iniciar sesión para subir archivos.');
      return;
    }

    const targetSongId = mode === 'addVersion' ? selectedExistingSongId : songDocId;

    const payload: CreateSongPayload = { mode };
    if (mode === 'new') {
      payload.songDocId = songDocId;
      payload.title = title.trim();
      if (songArtistOption?.id) {
        payload.artistId = songArtistOption.id;
        payload.artistName = songArtistOption.name;
      } else if (songArtistText.trim()) {
        payload.artistName = songArtistText.trim();
      }
      if (year.trim()) payload.year = Number(year.trim()) || undefined;
      if (liturgicalUse) payload.liturgicalUse = liturgicalUse;
    } else {
      payload.songId = selectedExistingSongId;
    }

    const resolvedVersions: CreateSongPayloadVersion[] = [];

    let coverImageUrl: string | undefined;
    let coverVersionDocId: string | undefined;

    if (mode === 'new' && coverFile) {
      coverVersionDocId = versions[0]?.docId;
      if (!coverVersionDocId) {
        setSubmitting(false);
        setErrorMessage('No se pudo resolver la versión para guardar la portada.');
        return;
      }

      const coverResult = await uploadCoverImage({
        file: coverFile,
        entity: 'songs',
        entityId: songDocId,
        versionId: coverVersionDocId,
        filenameBase: title.trim() || 'cover'
      });

      if (!coverResult.ok || !coverResult.url) {
        setSubmitting(false);
        setErrorMessage(coverResult.error ?? 'No se pudo subir la portada.');
        return;
      }

      coverImageUrl = coverResult.url;
    }

    for (const version of versions) {
      // 1) Audio (file or URL).
      let audioUrl = version.audioReferenceUrl.trim();
      if (!audioUrl && version.audioFile) {
        const result = await uploadVersionAsset({
          file: version.audioFile,
          songId: targetSongId,
          versionId: version.docId,
          kind: 'audio',
          filenameBase: version.versionName.trim() || 'audio'
        });
        if (!result.ok || !result.url) {
          setSubmitting(false);
          setErrorMessage(result.error ?? 'No se pudo subir el audio de una versión.');
          return;
        }
        audioUrl = result.url;
      }
      if (!audioUrl) {
        setSubmitting(false);
        setErrorMessage('Cada versión debe incluir audio (archivo o URL).');
        return;
      }

      // 2) Optional lyrics file.
      let lyricsFileUrl: string | undefined;
      if (version.lyricsFile) {
        const result = await uploadVersionAsset({
          file: version.lyricsFile,
          songId: targetSongId,
          versionId: version.docId,
          kind: 'lyrics',
          filenameBase: 'lyrics'
        });
        if (!result.ok || !result.url) {
          setSubmitting(false);
          setErrorMessage(result.error ?? 'No se pudo subir la letra (archivo) de una versión.');
          return;
        }
        lyricsFileUrl = result.url;
      }

      // 3) Optional sheet file.
      let sheetFileUrl: string | undefined;
      if (version.sheetFile) {
        const result = await uploadVersionAsset({
          file: version.sheetFile,
          songId: targetSongId,
          versionId: version.docId,
          kind: 'sheet',
          filenameBase: 'sheet'
        });
        if (!result.ok || !result.url) {
          setSubmitting(false);
          setErrorMessage(result.error ?? 'No se pudo subir la partitura de una versión.');
          return;
        }
        sheetFileUrl = result.url;
      }

      const versionArtistId = version.isOwnVersion
        ? (mode === 'new' ? payload.artistId : existingArtistOption?.id)
        : version.artistOption?.id;
      const versionArtistName = version.isOwnVersion
        ? (mode === 'new'
            ? (payload.artistName ?? songArtistText.trim())
            : (existingArtistOption?.name ?? ''))
        : (version.artistOption?.name ?? version.artistText.trim());

      resolvedVersions.push({
        versionDocId: version.docId,
        versionName: version.versionName.trim(),
        instrumentName: version.instrumentName.trim(),
        artistId: versionArtistId,
        artistName: versionArtistName,
        isOwnVersion: version.isOwnVersion,
        tone: version.tone.trim() || undefined,
        notationType: version.notationType || undefined,
        audioReferenceUrl: audioUrl,
        coverImageUrl: coverImageUrl && coverVersionDocId === version.docId ? coverImageUrl : undefined,
        lyrics: version.lyrics.trim(),
        lyricsFileUrl,
        sheetFileUrl
      });
    }

    payload.versions = resolvedVersions;
    if (coverImageUrl) {
      payload.coverImageUrl = coverImageUrl;
    }

    const result = await requestCreateSong(payload);
    setSubmitting(false);

    if (result.ok) {
      setSuccessMessage(mode === 'new' ? '¡Canción creada exitosamente!' : '¡Versión agregada exitosamente!');
      if (mode === 'new') {
        setCoverFile(null);
        setCoverPreviewUrl('');
        setCoverError('');
        setCoverPreparing(false);
      }
      const finalSongId = result.songId ?? targetSongId;
      const newestVersionId = result.versionIds && result.versionIds.length > 0
        ? result.versionIds[result.versionIds.length - 1]
        : versions[versions.length - 1]?.docId;
      if (finalSongId) {
        const url = newestVersionId
          ? `/songs/${finalSongId}?versionId=${encodeURIComponent(newestVersionId)}`
          : `/songs/${finalSongId}`;
        setTimeout(() => router.push(url), 1200);
      }
    } else {
      const messages: Record<string, string> = {
        plan_limit: result.message ?? 'Has alcanzado el límite de tu plan.',
        forbidden: 'No tienes permisos para realizar esta acción.',
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

        {/* ── Mode selector ─────────────────────────────────── */}
        <fieldset className="create-visibility-fieldset">
          <legend>¿Qué quieres subir? *</legend>
          <label className="create-inline-check">
            <input
              type="radio"
              name="upload-mode"
              value="new"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              disabled={submitting}
            />
            Una canción nueva
          </label>
          <label className="create-inline-check">
            <input
              type="radio"
              name="upload-mode"
              value="addVersion"
              checked={mode === 'addVersion'}
              onChange={() => setMode('addVersion')}
              disabled={submitting}
            />
            Una versión nueva de una canción existente
          </label>
        </fieldset>

        {/* ── New-song fields ───────────────────────────────── */}
        {mode === 'new' && (
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

            <ArtistAutocomplete
              value={songArtistOption}
              onChange={(artist, rawText) => {
                setSongArtistOption(artist);
                setSongArtistText(rawText);
              }}
              label="Artista / Autor *"
              placeholder="Buscar artista o escribir nuevo"
              required
              disabled={submitting}
            />

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

            <div className="create-form-field" />

            <div className="create-cover-field">
              <span>Portada (opcional)</span>
              <div className="create-cover-upload-row">
                <input
                  id="song-cover-upload"
                  className="create-cover-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => void handleCoverSelection(event.target.files?.[0] ?? null)}
                  disabled={submitting || coverPreparing}
                />
                <label htmlFor="song-cover-upload" className="create-cover-upload-button">
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
                    alt="Previsualización de portada"
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
          </div>
        )}

        {/* ── Add-version: select existing song ─────────────── */}
        {mode === 'addVersion' && (
          <div className="create-form-grid">
            <ArtistAutocomplete
              value={existingArtistOption}
              onChange={(artist) => setExistingArtistOption(artist)}
              label="Artista de la canción existente *"
              placeholder="Buscar artista en la base de datos"
              required
              disabled={submitting}
            />

            <label className="create-form-field">
              <span>Canción existente *</span>
              <select
                value={selectedExistingSongId}
                onChange={(e) => setSelectedExistingSongId(e.target.value)}
                disabled={submitting || !existingArtistOption?.id || loadingArtistSongs}
                required
              >
                <option value="">
                  {!existingArtistOption?.id
                    ? '— Selecciona primero un artista —'
                    : loadingArtistSongs
                      ? 'Cargando canciones…'
                      : existingArtistSongs.length === 0
                        ? 'Este artista aún no tiene canciones'
                        : '— Seleccionar canción —'}
                </option>
                {existingArtistSongs.map((song) => (
                  <option
                    key={`${song.sqlSongId}-${song.songId ?? 'no-firestore'}`}
                    value={song.songId ?? ''}
                    disabled={!song.songId}
                  >
                    {song.title}
                    {song.year ? ` (${song.year})` : ''}
                    {song.songId ? '' : ' — sin proyección Firestore'}
                  </option>
                ))}
              </select>
            </label>

            <div className="create-form-field" />
            <div className="create-form-field" />
          </div>
        )}

        <section className="create-versions-section">
          <div className="create-versions-header">
            <h3>Versiones *</h3>
            <button type="button" className="create-form-cancel" onClick={addVersion} disabled={submitting}>
              + Agregar versión
            </button>
          </div>

          {versions.map((version, index) => (
            <article key={version.localId} className="create-version-card">
              <div className="create-version-card-header">
                <strong>Versión {index + 1}</strong>
                <button
                  type="button"
                  className="create-version-remove"
                  disabled={versions.length === 1 || submitting}
                  onClick={() => removeVersion(version.localId)}
                >
                  Eliminar
                </button>
              </div>

              <div className="create-form-grid">
                <label className="create-form-field">
                  <span>Nombre de versión *</span>
                  <input
                    type="text"
                    value={version.versionName}
                    onChange={(e) => updateVersion(version.localId, { versionName: e.target.value })}
                    placeholder="Ej: Acústica"
                    required
                  />
                </label>

                <label className="create-form-field">
                  <span>Instrumento *</span>
                  <input
                    type="text"
                    value={version.instrumentName}
                    onChange={(e) => updateVersion(version.localId, { instrumentName: e.target.value })}
                    placeholder="Ej: Guitarra, Piano, Letra"
                    required
                  />
                </label>

                <div className="create-form-field create-checkbox-field">
                  <span>Autor de versión</span>
                  <label className="create-inline-check">
                    <input
                      type="checkbox"
                      checked={version.isOwnVersion}
                      onChange={(e) => updateVersion(version.localId, { isOwnVersion: e.target.checked })}
                    />
                    Es mi versión
                  </label>
                </div>

                {!version.isOwnVersion && (
                  <ArtistAutocomplete
                    value={version.artistOption}
                    onChange={(artist, rawText) => {
                      updateVersion(version.localId, { artistOption: artist, artistText: rawText });
                    }}
                    label="Artista de la versión *"
                    placeholder="Buscar artista o escribir nuevo"
                    required
                    disabled={submitting}
                  />
                )}

                <label className="create-form-field">
                  <span>Tono</span>
                  <input
                    type="text"
                    value={version.tone}
                    onChange={(e) => updateVersion(version.localId, { tone: e.target.value })}
                    placeholder="Ej: Do Mayor, Em"
                  />
                </label>

                <label className="create-form-field">
                  <span>Tipo de Notación</span>
                  <select
                    value={version.notationType}
                    onChange={(e) => updateVersion(version.localId, { notationType: e.target.value })}
                  >
                    <option value="">— Seleccionar —</option>
                    {NOTATION_TYPES.map((nt) => (
                      <option key={nt} value={nt}>{nt}</option>
                    ))}
                  </select>
                </label>

                <label className="create-form-field">
                  <span>Audio (archivo) *</span>
                  <input
                    type="file"
                    accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateVersion(version.localId, { audioFile: file });
                    }}
                  />
                </label>

                <label className="create-form-field">
                  <span>o URL de Audio *</span>
                  <input
                    type="url"
                    value={version.audioReferenceUrl}
                    onChange={(e) => updateVersion(version.localId, { audioReferenceUrl: e.target.value })}
                    placeholder="https://ejemplo.com/audio.mp3"
                  />
                </label>

                <label className="create-form-field">
                  <span>Letra (archivo opcional)</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateVersion(version.localId, { lyricsFile: file });
                    }}
                  />
                </label>

                <label className="create-form-field">
                  <span>Partitura (archivo opcional)</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateVersion(version.localId, { sheetFile: file });
                    }}
                  />
                </label>
              </div>

              <label className="create-form-field">
                <span>Letra de esta versión *</span>
                <textarea
                  value={version.lyrics}
                  onChange={(e) => updateVersion(version.localId, { lyrics: e.target.value })}
                  placeholder="Escribe o pega la letra de esta versión…"
                  rows={10}
                  required={!version.lyricsFile}
                />
              </label>
            </article>
          ))}
        </section>

        <div className="create-form-actions">
          <button type="button" className="create-form-cancel" onClick={() => router.back()}>
            Cancelar
          </button>
          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            {submitting
              ? 'Enviando...'
              : mode === 'addVersion'
                ? 'Agregar versión'
                : 'Crear Canción'}
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

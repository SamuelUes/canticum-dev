'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSongDetailById, requestDeleteSong, requestUpdateSong } from '../../features/song/repository';
import { uploadVersionAsset } from '../../features/song/versionAssetUpload';
import { prepareCoverImageFile, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { SkeletonCard, SkeletonText } from '../ui/skeleton';
import type { SongDetail, SongVersion } from '../../types/song';

interface EditSongWorkspaceProps {
  songId: string;
}

type SongState = 'DRAFT' | 'UPLOADED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED';

const NOTATION_TYPES = ['Cifrado', 'Partitura', 'Tablatura', 'Ninguno'];

interface EditableInstrumentation {
  id?: string;
  instrumentationId?: string;
  versionId?: string;
  localId: string;
  docId: string;
  instrumentName: string;
  lyrics?: string;
  lyricsFileUrl?: string;
  sheetFileUrl?: string;
  lyricsFile: File | null;
  sheetFile: File | null;
  audioFile: File | null;
  audioReferenceUrl: string;
  tone?: string;
  notationType?: string;
}

interface EditableVersion extends Omit<SongVersion, 'instrumentations'> {
  markedForDeletion?: boolean;
  audioMode?: 'shared' | 'per_instrumentation' | 'legacy';
  audioFile?: File | null;
  audioReferenceUrl?: string;
  instrumentations?: EditableInstrumentation[];
}

function parseState(raw: unknown): SongState {
  const value = String(raw ?? '').trim().toUpperCase();
  const supported: SongState[] = ['DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];
  return supported.includes(value as SongState) ? (value as SongState) : 'DRAFT';
}

export function EditSongWorkspace({ songId }: EditSongWorkspaceProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [song, setSong] = useState<SongDetail | null>(null);
  const [title, setTitle] = useState('');
  const [state, setState] = useState<SongState>('DRAFT');
  const [versions, setVersions] = useState<EditableVersion[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      const detail = await getSongDetailById(songId);

      if (!alive) return;

      if (!detail) {
        setError('No se pudo cargar la canción.');
        setLoading(false);
        return;
      }

      setSong(detail);
      setTitle(detail.title);
      setState(parseState((detail as SongDetail & { status?: unknown }).status));
      setVersions(detail.versions.map((version) => ({
        ...version,
        markedForDeletion: false,
        audioMode: version.audioMode || 'legacy',
        audioReferenceUrl: version.audioReferenceUrl || '',
        instrumentations: (version.instrumentations || []).map((inst) => ({
          ...inst,
          localId: inst.id || `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          docId: inst.instrumentationId || '',
          lyricsFile: null,
          sheetFile: null,
          audioFile: null,
          audioReferenceUrl: inst.audioReferenceUrl || ''
        }))
      })));
      const nextCoverImageUrl = detail.coverImageUrl ?? detail.images?.[0]?.url ?? '';
      setCoverPreviewUrl(nextCoverImageUrl);
      setLoading(false);
    };

    void load();

    return () => {
      alive = false;
    };
  }, [songId]);

  const canSave = useMemo(() => !loading && !saving && title.trim().length > 0, [loading, saving, title]);

  const updateVersion = (versionId: string, patch: Partial<EditableVersion>) => {
    setVersions((prev) => prev.map((entry) => (entry.id === versionId ? { ...entry, ...patch } : entry)));
  };

  const updateInstrumentation = (versionId: string, instLocalId: string, patch: Partial<EditableInstrumentation>) => {
    setVersions((prev) => prev.map((version) => {
      if (version.id !== versionId) return version;
      return {
        ...version,
        instrumentations: version.instrumentations?.map((inst) =>
          inst.localId === instLocalId ? { ...inst, ...patch } : inst
        ) || []
      };
    }));
  };

  const addInstrumentation = (versionId: string) => {
    setVersions((prev) => prev.map((version) => {
      if (version.id !== versionId) return version;
      // const seed = (version.instrumentations?.length || 0) + 1;
      const localId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        ...version,
        instrumentations: [
          ...(version.instrumentations || []),
          {
            localId,
            docId: '',
            instrumentName: 'Letra',
            lyrics: '',
            lyricsFile: null,
            sheetFile: null,
            audioFile: null,
            audioReferenceUrl: '',
            tone: '',
            notationType: ''
          }
        ]
      };
    }));
  };

  const removeInstrumentation = (versionId: string, instLocalId: string) => {
    setVersions((prev) => prev.map((version) => {
      if (version.id !== versionId) return version;
      if (!version.instrumentations || version.instrumentations.length <= 1) return version;
      return {
        ...version,
        instrumentations: version.instrumentations.filter((inst) => inst.localId !== instLocalId)
      };
    }));
  };

  const addVersion = () => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instLocalId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setVersions((prev) => [
      ...prev,
      {
        id: localId,
        versionId: localId,
        songId,
        versionName: `Versión ${prev.length + 1}`,
        artistName: song?.artistName ?? user?.displayName ?? user?.email ?? 'Autor',
        label: `Versión ${prev.length + 1}`,
        lyrics: '',
        isPremium: false,
        markedForDeletion: false,
        audioMode: 'shared',
        audioReferenceUrl: '',
        instrumentations: [{
          localId: instLocalId,
          docId: '',
          instrumentName: 'Letra',
          lyrics: '',
          lyricsFile: null,
          sheetFile: null,
          audioFile: null,
          audioReferenceUrl: '',
          tone: '',
          notationType: ''
        }]
      }
    ]);
  };

  const toggleDeleteVersion = (versionId: string) => {
    setVersions((prev) => prev.map((entry) => (
      entry.id === versionId
        ? { ...entry, markedForDeletion: !entry.markedForDeletion }
        : entry
    )));
  };

  const onCoverSelected = async (file: File | null) => {
    if (!file) {
      setCoverFile(null);
      return;
    }

    const prepared = await prepareCoverImageFile(file);
    if (!prepared.ok) {
      setError(prepared.error);
      return;
    }

    setCoverFile(prepared.file);
    setCoverPreviewUrl(URL.createObjectURL(prepared.file));
    setError('');
  };

  const onSave = async () => {
    if (!canSave || !song) return;

    setSaving(true);
    setError('');

    try {
      let nextCoverImageUrl: string | null | undefined;

      if (coverFile) {
        const cover = await uploadCoverImage({
          file: coverFile,
          entity: 'songs',
          entityId: songId,
          filenameBase: title.trim() || 'cover'
        });

        if (!cover.ok || !cover.url) {
          setSaving(false);
          setError(cover.error ?? 'No se pudo subir la portada de la canción.');
          return;
        }

        nextCoverImageUrl = cover.url;
        setCoverFile(null);
      }

      const nextStatus = state === 'APPROVED' || state === 'PUBLISHED' ? 'DRAFT' : state;
      const versionPayload = versions
        .map((version) => ({
          id: version.id,
          versionId: version.versionId,
          sqlSongVersionId: (version as SongVersion & { sqlSongVersionId?: number | string }).sqlSongVersionId,
          versionName: version.versionName ?? 'Versión',
          artistName: version.artistName,
          instrumentName: version.instrumentName ?? 'Letra',
          label: version.label ?? version.versionName ?? 'Versión',
          lyrics: version.lyrics ?? '',
          audioReferenceUrl: version.audioReferenceUrl ?? null,
          notationType: version.notationType ?? null,
          tone: version.tone ?? null,
          coverImageUrl: version.coverImageUrl ?? null,
          markedForDeletion: version.markedForDeletion === true,
          audioMode: version.audioMode || 'legacy',
          instrumentations: version.instrumentations?.map((inst) => ({
            instrumentationId: inst.instrumentationId,
            instrumentName: inst.instrumentName,
            lyrics: inst.lyrics || undefined,
            lyricsFileUrl: inst.lyricsFileUrl || undefined,
            sheetFileUrl: inst.sheetFileUrl || undefined,
            audioReferenceUrl: version.audioMode === 'per_instrumentation' ? (inst.audioReferenceUrl || undefined) : undefined,
            tone: inst.tone || undefined,
            notationType: inst.notationType || undefined
          })) || []
        }))
        .filter((version) => !(version.markedForDeletion && String(version.id ?? '').startsWith('local-')));

      const result = await requestUpdateSong(songId, {
        title: title.trim(),
        status: nextStatus,
        versions: versionPayload,
        ...(nextCoverImageUrl !== undefined ? { coverImageUrl: nextCoverImageUrl } : {}),
        currentVersionId: versions.find((version) => !version.markedForDeletion)?.id
      });

      if (!result.ok) {
        setError(result.message ?? 'No se pudo guardar la canción.');
        setSaving(false);
        return;
      }

      router.push(`/songs/${songId}`);
    } catch {
      setError('No se pudo guardar la canción.');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSong = async () => {
    const confirmDelete = window.confirm('¿Eliminar canción completa? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    try {
      const result = await requestDeleteSong(songId);
      if (!result.ok) {
        setError(result.message ?? 'No se pudo eliminar la canción.');
        return;
      }

      router.push('/account');
    } catch {
      setError('No se pudo eliminar la canción.');
    }
  };

  if (loading) {
    return (
      <section className="create-page-layout layout-h-margin" aria-busy aria-label="Cargando canción">
        <header className="create-page-header">
          <SkeletonText width={220} className="edit-song-skeleton-title" />
          <SkeletonText width="70%" className="edit-song-skeleton-subtitle" />
        </header>
        <div className="create-form-grid">
          <SkeletonText className="edit-song-skeleton-input" />
          <SkeletonText className="edit-song-skeleton-input" />
        </div>
        <div className="create-cover-field">
          <SkeletonCard className="edit-song-skeleton-cover" />
        </div>
        <section className="create-versions-section">
          <div className="create-versions-header">
            <SkeletonText width={150} className="edit-song-skeleton-section-title" />
            <SkeletonText width={140} className="edit-song-skeleton-button-small" />
          </div>
          {Array.from({ length: 2 }).map((_, idx) => (
            <div className="create-version-card" key={idx}>
              <SkeletonText className="edit-song-skeleton-version-field" />
              <SkeletonText className="edit-song-skeleton-version-field" />
              <SkeletonText className="edit-song-skeleton-version-lyrics" />
              <SkeletonText className="edit-song-skeleton-version-field" />
              <SkeletonText width={160} className="edit-song-skeleton-version-action" />
            </div>
          ))}
        </section>
      </section>
    );
  }

  return (
    <section className="create-page-layout layout-h-margin">
      <header className="create-page-header">
        <h1>Editar canción</h1>
        <p>Actualiza portada, letra, versiones y estado editorial. Si estaba aprobada/publicada vuelve a DRAFT.</p>
      </header>

      <form className="create-song-form" onSubmit={(e) => { e.preventDefault(); void onSave(); }}>
        {error ? <p className="create-form-error">{error}</p> : null}

        {/* ── Basic info ──────────────────────────────────── */}
        <div className="create-form-grid">
          <label className="create-form-field">
            <span>Título</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nombre de la canción"
            />
          </label>

          <label className="create-form-field">
            <span>Estado</span>
            <input value={state} disabled />
          </label>
        </div>

        {/* ── Cover ───────────────────────────────────────── */}
        <div className="create-cover-field">
          <span>Portada</span>
          <div className="create-cover-upload-row">
            <input
              id="song-cover-edit"
              className="create-cover-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(event) => void onCoverSelected(event.target.files?.[0] ?? null)}
            />
            <label htmlFor="song-cover-edit" className="create-cover-upload-button">
              Seleccionar imagen
            </label>
            <span className="create-cover-upload-meta">
              Mínimo 120x120 • máx 5MB
            </span>
          </div>

          {coverPreviewUrl && (
            <div className="create-cover-preview">
              <Image
                src={coverPreviewUrl}
                alt="Cover canción"
                width={88}
                height={88}
                unoptimized={coverPreviewUrl.startsWith('blob:') || coverPreviewUrl.startsWith('data:')}
              />
              <div className="create-cover-preview-actions">
                <span>{coverFile?.name ?? 'portada.jpg'}</span>
                <button
                  type="button"
                  className="create-form-cancel"
                  onClick={() => void onCoverSelected(null)}
                >
                  Quitar imagen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Versions ────────────────────────────────────── */}
        <section className="create-versions-section">
          <div className="create-versions-header">
            <h3>Versiones</h3>
            <button type="button" className="create-form-cancel" onClick={addVersion}>
              + Agregar versión
            </button>
          </div>

          {versions.map((version, index) => (
            <article key={version.id} className="create-version-card">
              <div className="create-version-card-header">
                <strong>Versión {index + 1}</strong>
                <button
                  type="button"
                  className="create-version-remove"
                  onClick={() => toggleDeleteVersion(version.id)}
                  style={version.markedForDeletion ? { background: '#e8fff1', color: '#235b3a' } : undefined}
                >
                  {version.markedForDeletion ? 'Restaurar versión' : 'Eliminar versión'}
                </button>
              </div>

              <div className="create-form-grid">
                <label className="create-form-field">
                  <span>Nombre de versión</span>
                  <input
                    type="text"
                    value={version.versionName ?? ''}
                    onChange={(event) => updateVersion(version.id, {
                      versionName: event.target.value,
                      label: event.target.value
                    })}
                    placeholder="Ej: Acústica"
                  />
                </label>

                <label className="create-form-field">
                  <span>Modo de audio</span>
                  <select
                    value={version.audioMode || 'legacy'}
                    onChange={(event) => updateVersion(version.id, { audioMode: event.target.value as 'shared' | 'per_instrumentation' | 'legacy' })}
                  >
                    <option value="legacy">Legado (un instrumento)</option>
                    <option value="shared">Audio compartido (una pista para todos)</option>
                    <option value="per_instrumentation">Audio por instrumentación</option>
                  </select>
                </label>
              </div>

              {/* Legacy fields for backward compatibility */}
              {version.audioMode === 'legacy' && (
                <div className="create-form-grid">
                  <label className="create-form-field">
                    <span>Instrumento (legado)</span>
                    <input
                      value={version.instrumentName ?? ''}
                      onChange={(event) => updateVersion(version.id, { instrumentName: event.target.value })}
                    />
                  </label>

                  <label className="create-form-field">
                    <span>Audio URL (legado)</span>
                    <input
                      type="url"
                      value={version.audioReferenceUrl ?? ''}
                      onChange={(event) => updateVersion(version.id, { audioReferenceUrl: event.target.value })}
                      placeholder="https://ejemplo.com/audio.mp3"
                    />
                  </label>

                  <label className="create-form-field" style={{ gridColumn: '1 / -1' }}>
                    <span>Letra (legado)</span>
                    <textarea
                      rows={6}
                      value={version.lyrics ?? ''}
                      onChange={(event) => updateVersion(version.id, { lyrics: event.target.value })}
                    />
                  </label>

                  <div className="create-form-field">
                    <span>Archivo audio (opcional)</span>
                    <div className="create-file-upload-wrapper">
                      <input
                        id={`version-audio-legacy-${version.id}`}
                        className="create-file-upload-input"
                        type="file"
                        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) return;
                          void uploadVersionAsset({
                            file,
                            songId,
                            versionId: version.id,
                            kind: 'audio',
                            filenameBase: version.versionName ?? 'audio'
                          }).then((result) => {
                            if (result.ok && result.url) {
                              updateVersion(version.id, { audioReferenceUrl: result.url });
                            }
                          });
                        }}
                      />
                      <label htmlFor={`version-audio-legacy-${version.id}`} className="create-file-upload-button">
                        Seleccionar archivo
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* New instrumentation-based UI */}
              {version.audioMode !== 'legacy' && (
                <div className="create-instrumentations-section">
                  <div className="create-instrumentations-header">
                    <strong>Instrumentaciones</strong>
                    <button
                      type="button"
                      className="create-form-cancel"
                      onClick={() => addInstrumentation(version.id)}
                    >
                      + Agregar instrumentación
                    </button>
                  </div>

                  {version.instrumentations?.map((inst, instIndex) => (
                    <article key={inst.localId} className="create-instrumentation-card">
                      <div className="create-instrumentation-card-header">
                        <div className="create-instrumentation-title">
                          <span className="create-instrumentation-number">{instIndex + 1}</span>
                          <strong>{inst.instrumentName || 'Instrumentación sin nombre'}</strong>
                        </div>
                        <button
                          type="button"
                          className="create-version-remove"
                          disabled={!version.instrumentations || version.instrumentations.length <= 1}
                          onClick={() => removeInstrumentation(version.id, inst.localId)}
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className="create-instrumentation-body">
                        <div className="create-instrumentation-section">
                          <h4 className="create-instrumentation-section-title">Información básica</h4>
                          <div className="create-form-grid">
                            <label className="create-form-field">
                              <span>Instrumento</span>
                              <input
                                type="text"
                                value={inst.instrumentName}
                                onChange={(event) => updateInstrumentation(version.id, inst.localId, { instrumentName: event.target.value })}
                                placeholder="Ej: Guitarra, Piano, Letra"
                              />
                            </label>

                            <label className="create-form-field">
                              <span>Tono</span>
                              <input
                                type="text"
                                value={inst.tone || ''}
                                onChange={(event) => updateInstrumentation(version.id, inst.localId, { tone: event.target.value })}
                                placeholder="Ej: Do Mayor, Em"
                              />
                            </label>

                            <label className="create-form-field">
                              <span>Tipo de Notación</span>
                              <select
                                value={inst.notationType || ''}
                                onChange={(event) => updateInstrumentation(version.id, inst.localId, { notationType: event.target.value })}
                              >
                                <option value="">— Seleccionar —</option>
                                {NOTATION_TYPES.map((nt) => (
                                  <option key={nt} value={nt}>{nt}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        {version.audioMode === 'per_instrumentation' && (
                          <div className="create-instrumentation-section">
                            <h4 className="create-instrumentation-section-title">Audio</h4>
                            <div className="create-form-grid">
                              <div className="create-form-field">
                                <span>Audio (archivo)</span>
                                <div className="create-file-upload-wrapper">
                                  <input
                                    id={`inst-audio-${version.id}-${inst.localId}`}
                                    className="create-file-upload-input"
                                    type="file"
                                    accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0] ?? null;
                                      updateInstrumentation(version.id, inst.localId, { audioFile: file });
                                    }}
                                  />
                                  <label htmlFor={`inst-audio-${version.id}-${inst.localId}`} className="create-file-upload-button">
                                    {inst.audioFile ? inst.audioFile.name : 'Seleccionar archivo'}
                                  </label>
                                </div>
                              </div>

                              <label className="create-form-field">
                                <span>o URL de Audio</span>
                                <input
                                  type="url"
                                  value={inst.audioReferenceUrl}
                                  onChange={(event) => updateInstrumentation(version.id, inst.localId, { audioReferenceUrl: event.target.value })}
                                  placeholder="https://ejemplo.com/audio.mp3"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="create-instrumentation-section">
                          <h4 className="create-instrumentation-section-title">Archivos y contenido</h4>
                          <div className="create-form-grid">
                            <div className="create-form-field">
                              <span>Partitura (archivo opcional)</span>
                              <div className="create-file-upload-wrapper">
                                <input
                                  id={`inst-sheet-${version.id}-${inst.localId}`}
                                  className="create-file-upload-input"
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,.xml,.musicxml,.mxl,.doc,.docx,.mscz,.mscx,.txt,application/pdf,image/png,image/jpeg,application/xml,text/xml,text/plain"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    updateInstrumentation(version.id, inst.localId, { sheetFile: file });
                                  }}
                                />
                                <label htmlFor={`inst-sheet-${version.id}-${inst.localId}`} className="create-file-upload-button">
                                  {inst.sheetFile ? inst.sheetFile.name : 'Seleccionar archivo'}
                                </label>
                                {inst.sheetFile && (
                                  <button
                                    type="button"
                                    className="create-file-upload-cancel"
                                    onClick={() => {
                                      const input = document.getElementById(`inst-sheet-${version.id}-${inst.localId}`) as HTMLInputElement | null;
                                      if (input) input.value = '';
                                      updateInstrumentation(version.id, inst.localId, { sheetFile: null });
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {inst.sheetFile ? (
                            <p className="create-form-hint" style={{ fontWeight: '900' }}>
                              Al subir una partitura, la letra no está disponible para esta instrumentación. Solo puedes elegir uno: partitura <strong>o</strong> letra. Si necesitas la letra, crea una nueva instrumentación.
                            </p>
                          ) : (
                            <label className="create-form-field">
                              <span>Letra de esta instrumentación</span>
                              <textarea
                                value={inst.lyrics || ''}
                                onChange={(event) => updateInstrumentation(version.id, inst.localId, { lyrics: event.target.value })}
                                placeholder="Escribe o pega la letra para esta instrumentación…"
                                rows={6}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}

                  {version.audioMode === 'shared' && (
                    <div className="create-form-grid">
                      <label className="create-form-field">
                        <span>Audio URL (compartido)</span>
                        <input
                          type="url"
                          value={version.audioReferenceUrl ?? ''}
                          onChange={(event) => updateVersion(version.id, { audioReferenceUrl: event.target.value })}
                          placeholder="https://ejemplo.com/audio.mp3"
                        />
                      </label>

                      <div className="create-form-field">
                        <span>Archivo audio (opcional)</span>
                        <div className="create-file-upload-wrapper">
                          <input
                            id={`version-audio-shared-${version.id}`}
                            className="create-file-upload-input"
                            type="file"
                            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              if (!file) return;
                              void uploadVersionAsset({
                                file,
                                songId,
                                versionId: version.id,
                                kind: 'audio',
                                filenameBase: version.versionName ?? 'audio'
                              }).then((result) => {
                                if (result.ok && result.url) {
                                  updateVersion(version.id, { audioReferenceUrl: result.url });
                                }
                              });
                            }}
                          />
                          <label htmlFor={`version-audio-shared-${version.id}`} className="create-file-upload-button">
                            Seleccionar archivo
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>

        <div className="create-form-actions">
          <button type="button" className="create-form-cancel" onClick={() => router.back()}>
            Cancelar
          </button>
          <button type="submit" className="create-form-submit" disabled={!canSave}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button type="button" className="create-form-cancel" onClick={() => void onDeleteSong()}>
            Eliminar canción
          </button>
        </div>
      </form>
    </section>
  );
}

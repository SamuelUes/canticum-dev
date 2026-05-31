'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { useAuth } from '../../context/AuthContext';
import { getSongDetailById, requestDeleteSong, requestUpdateSong } from '../../features/song/repository';
import { uploadVersionAsset } from '../../features/song/versionAssetUpload';
import { prepareCoverImageFile, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import type { SongDetail, SongVersion } from '../../types/song';

interface EditSongWorkspaceProps {
  songId: string;
}

type SongState = 'DRAFT' | 'UPLOADED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED';

interface EditableVersion extends SongVersion {
  markedForDeletion?: boolean;
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
      setVersions(detail.versions.map((version) => ({ ...version, markedForDeletion: false })));
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

  const addVersion = () => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setVersions((prev) => [
      ...prev,
      {
        id: localId,
        versionId: localId,
        songId,
        versionName: `Versión ${prev.length + 1}`,
        artistName: song?.artistName ?? user?.displayName ?? user?.email ?? 'Autor',
        instrumentName: 'Letra',
        label: `Versión ${prev.length + 1}`,
        lyrics: '',
        isPremium: false,
        markedForDeletion: false
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
          markedForDeletion: version.markedForDeletion === true
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
      <section className="account-page-layout layout-h-margin" aria-busy aria-label="Cargando canción">
        <header className="account-page-head">
          <Skeleton width={220} height={34} />
          <Skeleton width="70%" height={16} />
        </header>
        <article className="account-card">
          <div className="account-basic-grid">
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
          <Skeleton width={180} height={180} />
          <Skeleton height={42} width={220} />
        </article>
        <article className="account-card song-edit-versions-card">
          <div className="create-versions-header song-edit-versions-head">
            <Skeleton width={150} height={30} />
            <Skeleton width={140} height={36} />
          </div>
          <div className="account-items-grid song-edit-versions-grid">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div className="account-item-card song-edit-version-card" key={idx}>
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={110} />
                <Skeleton height={40} />
                <Skeleton height={36} width={160} />
              </div>
            ))}
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="account-page-layout layout-h-margin">
      <header className="account-page-head">
        <h1>Editar canción</h1>
        <p>Actualiza portada, letra, versiones y estado editorial. Si estaba aprobada/publicada vuelve a DRAFT.</p>
      </header>

      {error ? <p className="create-form-error">{error}</p> : null}

      <article className="account-card">
        <div className="account-basic-grid">
          <label>
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Estado</span>
            <input value={state} disabled />
          </label>
        </div>

        <label>
          <span>Cover</span>
          {coverPreviewUrl ? (
            <Image
              src={coverPreviewUrl}
              alt="Cover canción"
              className="account-cover-preview"
              width={180}
              height={180}
              unoptimized={coverPreviewUrl.startsWith('blob:') || coverPreviewUrl.startsWith('data:')}
            />
          ) : null}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={(event) => void onCoverSelected(event.target.files?.[0] ?? null)}
          />
        </label>
      </article>

      <article className="account-card song-edit-versions-card">
        <div className="create-versions-header song-edit-versions-head">
          <h2 className="song-edit-versions-title">Versiones</h2>
          <button type="button" className="create-form-cancel song-edit-add-version" onClick={addVersion}>+ Agregar versión</button>
        </div>

        <div className="account-items-grid song-edit-versions-grid">
          {versions.map((version) => (
            <div className="account-item-card song-edit-version-card" key={version.id}>
              <label className="song-edit-version-field">
                <span>Nombre versión</span>
                <input
                  value={version.versionName ?? ''}
                  onChange={(event) => updateVersion(version.id, {
                    versionName: event.target.value,
                    label: event.target.value
                  })}
                />
              </label>

              <label className="song-edit-version-field">
                <span>Instrumento</span>
                <input
                  value={version.instrumentName ?? ''}
                  onChange={(event) => updateVersion(version.id, { instrumentName: event.target.value })}
                />
              </label>

              <label className="song-edit-version-field song-edit-version-field--full">
                <span>Letra</span>
                <textarea
                  className="song-edit-lyrics-input"
                  rows={6}
                  value={version.lyrics ?? ''}
                  onChange={(event) => updateVersion(version.id, { lyrics: event.target.value })}
                />
              </label>

              <label className="song-edit-version-field">
                <span>Audio URL</span>
                <input
                  value={version.audioReferenceUrl ?? ''}
                  onChange={(event) => updateVersion(version.id, { audioReferenceUrl: event.target.value })}
                />
              </label>

              <label className="song-edit-version-field song-edit-file-field">
                <span>Archivo audio (opcional)</span>
                <input
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
              </label>

              <div className="account-item-actions song-edit-version-actions">
                <button
                  type="button"
                  className={`song-edit-version-delete ${version.markedForDeletion ? 'is-restore' : 'is-delete'}`}
                  onClick={() => toggleDeleteVersion(version.id)}
                >
                  {version.markedForDeletion ? 'Restaurar versión' : 'Eliminar versión'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <div className="create-form-actions">
        <button type="button" className="create-form-cancel" onClick={() => router.back()}>
          Cancelar
        </button>
        <button type="button" className="create-form-submit" disabled={!canSave} onClick={() => void onSave()}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button type="button" className="create-form-cancel" onClick={() => void onDeleteSong()}>
          Eliminar canción
        </button>
      </div>
    </section>
  );
}

'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchRepertoireDetailClient,
  requestDeleterepertoire,
  requestSearchRepertoireSongs,
  requestUpdaterepertoire
} from '../../features/repertoire/clientPersistence';
import { getSongTitleById } from '../../features/song/repository';
import { prepareCoverImageFile, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import type { RepertoireSongSearchOption, SongRef } from '../../types/repertoire';

interface EditRepertoireWorkspaceProps {
  repertoireId: string;
}

type RepertoireState = 'DRAFT' | 'UPLOADED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'ARCHIVED';

function parseState(raw: unknown): RepertoireState {
  const value = String(raw ?? '').trim().toUpperCase();
  const supported: RepertoireState[] = ['DRAFT', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED'];
  return supported.includes(value as RepertoireState) ? (value as RepertoireState) : 'DRAFT';
}

export function EditRepertoireWorkspace({ repertoireId }: EditRepertoireWorkspaceProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [liturgicalType, setLiturgicalType] = useState('General');
  const [isPublic, setIsPublic] = useState(false);
  const [state, setState] = useState<RepertoireState>('DRAFT');
  const [songs, setSongs] = useState<SongRef[]>([]);
  const [searchText, setSearchText] = useState('');
  const [options, setOptions] = useState<RepertoireSongSearchOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      const raw = await fetchRepertoireDetailClient(repertoireId);
      if (!alive) return;

      if (!raw) {
        setLoading(false);
        setError('No se pudo cargar el repertorio.');
        return;
      }

      const baseSongs: SongRef[] = Array.isArray(raw.songs)
        ? (raw.songs as Array<Record<string, unknown>>).map((song) => ({
            id: String(song.songId ?? song.id ?? ''),
            title: String(song.title ?? song.songId ?? song.id ?? 'Canción'),
            artistName: typeof song.artistName === 'string' ? song.artistName : undefined,
            versionId: typeof song.versionId === 'string' ? song.versionId : undefined,
            versionName: typeof song.versionName === 'string' ? song.versionName : undefined,
            instrumentName: typeof song.instrumentName === 'string' ? song.instrumentName : undefined
          }))
        : Array.isArray(raw.songIds)
          ? (raw.songIds as unknown[]).map((songId) => ({
              id: String(songId),
              title: String(songId)
            }))
          : [];

      const nextSongs = await Promise.all(baseSongs.map(async (song): Promise<SongRef> => {
        const hasHumanTitle = song.title.trim().length > 0 && song.title.trim() !== song.id.trim();
        const hasArtist = typeof song.artistName === 'string' && song.artistName.trim().length > 0;

        if (hasHumanTitle && hasArtist) {
          return song;
        }

        const resolved = await getSongTitleById(song.id, song.versionId);
        if (!resolved) {
          return song;
        }

        return {
          ...song,
          title: resolved.title?.trim().length ? resolved.title : song.title,
          artistName: hasArtist ? song.artistName : (resolved.artistName ?? song.artistName),
          versionId: song.versionId ?? resolved.versionId
        };
      }));

      if (!alive) return;

      setTitle(typeof raw.title === 'string' ? raw.title : 'Repertorio');
      setDescription(typeof raw.description === 'string' ? raw.description : '');
      setLiturgicalType(typeof raw.liturgicalType === 'string' ? raw.liturgicalType : 'General');
      setIsPublic(Boolean(raw.isPublic));
      setState(parseState(raw.status));
      setSongs(nextSongs.filter((song) => song.id.trim().length > 0));

      const rawCover = typeof raw.coverImageUrl === 'string' ? raw.coverImageUrl : '';
      setCoverImageUrl(rawCover);
      setCoverPreviewUrl(rawCover);
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, [repertoireId]);

  useEffect(() => {
    let alive = true;

    const runSearch = async () => {
      const q = searchText.trim();
      if (!q) {
        setOptions([]);
        return;
      }
      const result = await requestSearchRepertoireSongs(q, 10);
      if (!alive) return;
      setOptions(result);
    };

    void runSearch();

    return () => {
      alive = false;
    };
  }, [searchText]);

  const canSave = useMemo(() => title.trim().length > 0 && !saving && !loading, [loading, saving, title]);

  const addSong = useCallback((option: RepertoireSongSearchOption) => {
    setSongs((prev) => {
      const exists = prev.some((song) => song.id === option.songId && (song.versionId ?? '') === (option.versionId ?? ''));
      if (exists) return prev;
      return [
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
      ];
    });
    setSearchText('');
    setOptions([]);
  }, []);

  const moveSong = (index: number, direction: -1 | 1) => {
    setSongs((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const current = next[index];
      next[index] = next[target];
      next[target] = current;
      return next;
    });
  };

  const removeSong = (index: number) => {
    setSongs((prev) => prev.filter((_, idx) => idx !== index));
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
    if (!canSave) return;

    setSaving(true);
    setError('');

    let nextCoverImageUrl = coverImageUrl;
    if (coverFile) {
      const cover = await uploadCoverImage({
        file: coverFile,
        entity: 'repertoires',
        entityId: repertoireId,
        filenameBase: title.trim() || 'cover'
      });

      if (!cover.ok || !cover.url) {
        setSaving(false);
        setError(cover.error ?? 'No se pudo subir la portada.');
        return;
      }

      nextCoverImageUrl = cover.url;
      setCoverImageUrl(cover.url);
      setCoverFile(null);
    }

    const nextState = state === 'APPROVED' || state === 'PUBLISHED' ? 'DRAFT' : state;

    const result = await requestUpdaterepertoire(repertoireId, {
      title: title.trim(),
      description: description.trim(),
      liturgicalType: liturgicalType.trim() || 'General',
      isPublic,
      songIds: songs.map((song) => song.id),
      songs: songs.map((song) => ({
        songId: song.id,
        ...(song.versionId ? { versionId: song.versionId } : {})
      })),
      coverImageUrl: nextCoverImageUrl,
      status: nextState
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.message ?? 'No se pudo guardar el repertorio.');
      return;
    }

    router.push(`/repertoires/${repertoireId}`);
  };

  const onDelete = async () => {
    const confirmDelete = window.confirm('¿Eliminar este repertorio? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    const result = await requestDeleterepertoire(repertoireId);
    if (!result.ok) {
      setError('No se pudo eliminar el repertorio.');
      return;
    }

    router.push('/account');
  };

  if (loading) {
    return <section className="account-page-layout layout-h-margin"><p>Cargando repertorio...</p></section>;
  }

  return (
    <section className="account-page-layout layout-h-margin">
      <header className="account-page-head">
        <h1>Editar repertorio</h1>
        <p>Ordena canciones, agrega versiones/canciones, actualiza portada, bio y metadata general.</p>
      </header>

      {error ? <p className="create-form-error">{error}</p> : null}

      <article className="account-card">
        <div className="account-basic-grid">
          <label>
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Tipo litúrgico</span>
            <input value={liturgicalType} onChange={(event) => setLiturgicalType(event.target.value)} />
          </label>
        </div>

        <label>
          <span>Descripción / Bio</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
        </label>

        <div className="account-basic-grid">
          <label>
            <span>Visibilidad</span>
            <select value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')}>
              <option value="private">Privado</option>
              <option value="public">Público</option>
            </select>
          </label>
          <label>
            <span>Estado actual</span>
            <input value={state} disabled />
          </label>
        </div>
      </article>

      <article className="account-card">
        <h2>Portada</h2>
        {coverPreviewUrl ? (
          <Image
            src={coverPreviewUrl}
            alt="Portada del repertorio"
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
      </article>

      <article className="account-card">
        <h2>Canciones y versiones</h2>
        <label>
          <span>Buscar canción o versión</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Título, artista, versión..."
          />
        </label>

        {options.length > 0 ? (
          <ul className="account-search-options">
            {options.map((option) => (
              <li key={`${option.songId}-${option.versionId ?? 'song'}`}>
                <button type="button" onClick={() => addSong(option)}>
                  <strong>{option.title}</strong>
                  <small>
                    {option.versionName ? `${option.versionName} · ` : ''}
                    {option.artistName ?? option.songArtistName ?? 'Sin artista'}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {songs.length > 0 ? (
          <ol className="create-repertoire-song-list">
            {songs.map((song, index) => {
              const displayTitle = song.title && song.title.trim().length > 0 ? song.title : `Canción ${index + 1}`;
              const artistLine = song.artistName && song.artistName.trim().length > 0 ? song.artistName : 'Sin artista';
              const versionLine = [song.versionName, song.instrumentName].filter(Boolean).join(' · ');

              return (
                <li key={`${song.id}-${song.versionId ?? index}`} className="create-repertoire-song-item">
                  <span className="create-repertoire-song-num">{index + 1}</span>
                  <div className="create-repertoire-song-info">
                    <strong>{displayTitle}</strong>
                    <small>{artistLine}</small>
                    {versionLine ? <small>{versionLine}</small> : null}
                  </div>
                  <div className="create-repertoire-song-actions">
                    <button type="button" aria-label="Subir canción" disabled={index === 0} onClick={() => moveSong(index, -1)}>
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="Bajar canción"
                      disabled={index === songs.length - 1}
                      onClick={() => moveSong(index, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar canción"
                      className="create-repertoire-remove-btn"
                      onClick={() => removeSong(index)}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="create-form-empty">Aún no has agregado canciones a este repertorio.</p>
        )}
      </article>

      <div className="create-form-actions">
        <button type="button" className="create-form-cancel" onClick={() => router.back()}>
          Cancelar
        </button>
        <button type="button" className="create-form-submit" disabled={!canSave} onClick={() => void onSave()}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button type="button" className="create-form-cancel" onClick={() => void onDelete()}>
          Eliminar repertorio
        </button>
      </div>
    </section>
  );
}

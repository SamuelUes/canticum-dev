'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { useAuth } from '../../context/AuthContext';
import { ArtistAutocomplete, ArtistOption } from '../shared/ArtistAutocomplete';
import { fetchSongsByArtist } from '../../features/artist/repository';
import type { ArtistSongLookup } from '../../features/artist/repository';
import { prepareCoverImageFile, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { requestCreateAlbum } from '../../features/album/clientPersistence';
import { functionsBaseUrl, buildFunctionsHeaders} from '../../features/shared/functionsClient';
import type { AlbumTrack, AlbumType } from '../../types/album';

function isAlbumManager(role?: string): boolean {
  return role === 'admin' || role === 'editor';
}

const GENRES = ['Litúrgico', 'Contemporáneo', 'Tradicional', 'Instrumental'];
const ALBUM_TYPES: AlbumType[] = ['album', 'single', 'ep', 'compilation', 'live', 'concert'];

export function CreateAlbumWorkspace() {
  const router = useRouter();
  const { user, loading } = useAuth();
  
  // Form state
  const [title, setTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [genre, setGenre] = useState('');
  const [albumType, setAlbumType] = useState<AlbumType>('album');
  
  // Artist state
  const [artistOption, setArtistOption] = useState<ArtistOption | null>(null);
  const [existingArtistSongs, setExistingArtistSongs] = useState<ArtistSongLookup[]>([]);
  
  // Cover state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [coverInputKey, setCoverInputKey] = useState(0);
  
  // Track state
  const [addedTracks, setAddedTracks] = useState<AlbumTrack[]>([]);
  const [songSearchInput, setSongSearchInput] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedOptionIndex, setHighlightedOptionIndex] = useState(0);
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = useMemo(() => isAlbumManager(user?.role), [user?.role]);

  // Fetch songs when artist is selected
  useEffect(() => {
    if (artistOption?.id) {
      fetchSongsByArtist(artistOption.id).then(setExistingArtistSongs);
    } else {
      setExistingArtistSongs([]);
    }
  }, [artistOption?.id]);

  // Filter search options
  const searchOptions = useMemo(() => {
    const query = songSearchInput.toLowerCase().trim();
    if (!query) return existingArtistSongs;
    return existingArtistSongs.filter((song) =>
      song.title.toLowerCase().includes(query) ||
      String(song.songId || '').toLowerCase().includes(query)
    );
  }, [songSearchInput, existingArtistSongs]);

  const highlightableOptions = useMemo(() => {
    return searchOptions.filter((song) => !addedTracks.some((t) => t.songId === song.songId));
  }, [searchOptions, addedTracks]);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      artistOption !== null &&
      genre.length > 0 &&
      addedTracks.length > 0 &&
      !submitting
    );
  }, [title, artistOption, genre, addedTracks.length, submitting]);

  const clearForm = () => {
    setTitle('');
    setReleaseYear('');
    setGenre('');
    setAlbumType('album');
    setArtistOption(null);
    setCoverFile(null);
    setCoverPreview('');
    setCoverInputKey((v) => v + 1);
    setAddedTracks([]);
    setSongSearchInput('');
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleClear = () => {
    clearForm();
  };

  const handleCoverChange = async (file: File | null) => {
    if (!file) {
      setCoverFile(null);
      setCoverPreview('');
      return;
    }

    const result = await prepareCoverImageFile(file);
    if (result.ok) {
      setCoverFile(result.file);
      setCoverPreview(URL.createObjectURL(result.file));
    } else {
      setErrorMessage('Error al procesar la imagen de portada.');
    }
  };

  const handleSelectSong = (song: ArtistSongLookup) => {
    if (!song.songId) return;
    
    const newTrack: AlbumTrack = {
      songId: song.songId,
      songTitle: song.title,
      trackNumber: addedTracks.length + 1
    };
    
    setAddedTracks((prev) => [...prev, newTrack]);
    setSongSearchInput('');
    setIsSearchOpen(false);
  };

  const handleRemoveTrack = (songId: string) => {
    setAddedTracks((prev) => {
      const filtered = prev.filter((t) => t.songId !== songId);
      return filtered.map((t, i) => ({ ...t, trackNumber: i + 1 }));
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(addedTracks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const reordered = items.map((item, index) => ({
      ...item,
      trackNumber: index + 1
    }));

    setAddedTracks(reordered);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || !artistOption) {
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Create album first without cover
      const payload = {
        title: title.trim(),
        artistId: Number(artistOption.id),
        artistName: artistOption.name,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        albumType,
        genre,
        coverImageUrl: undefined,
        tracks: addedTracks.map(t => ({
          songId: t.songId,
          songTitle: t.songTitle,
          trackNumber: t.trackNumber
        }))
      };

      const result = await requestCreateAlbum(payload);

      if (!result.ok) {
        setErrorMessage(result.error || 'No se pudo crear el álbum.');
        setSubmitting(false);
        return;
      }

      // Upload cover with correct albumId if cover was provided
      if (coverFile && result.albumId) {
        const coverResult = await uploadCoverImage({
          file: coverFile,
          entity: 'albums',
          entityId: result.albumId
        });
        
        if (coverResult.ok && coverResult.url) {
          // Update album with cover URL
          try {
            const headers = await buildFunctionsHeaders({
              'Content-Type': 'application/json',
              Accept: 'application/json'
            });
            
            await fetch(`${functionsBaseUrl}/albums/${result.albumId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ coverUrl: coverResult.url })
            });
          } catch (updateError) {
            console.error('Error updating album cover:', updateError);
            // Continue anyway, album was created
          }
        }
      }

      setSuccessMessage('Álbum creado correctamente.');
      clearForm();

      // Redirect to album detail page
      if (result.albumId) {
        router.push(`/albums/${result.albumId}`);
      }
      setSubmitting(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      setErrorMessage(message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="create-page-layout album-create-layout">
        <header className="create-page-header">
          <h1>Crear nuevo álbum</h1>
          <p>Cargando permisos...</p>
        </header>
      </section>
    );
  }

  if (!canManage) {
    return (
      <section className="create-page-layout album-create-layout">
        <header className="create-page-header">
          <h1>Crear nuevo álbum</h1>
          <p>Solo admin o editor pueden crear álbumes.</p>
        </header>

        <div className="album-create-locked">
          <strong>Acceso restringido</strong>
          <p>No tienes permisos para crear álbumes.</p>
          <button type="button" className="create-form-submit" onClick={() => router.push('/')}>
            Volver al inicio
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="create-page-layout album-create-layout">
      <header className="create-page-header">
        <h1>Crear nuevo álbum</h1>
        <p>Configura los detalles, enlaza artistas y gestiona la lista de canciones.</p>
      </header>

      <form className="create-repertoire-form album-create-form" onSubmit={(event) => void handleSubmit(event)}>
        {/* Basic Info Card */}
        <section className="album-section-card">
          <div className="album-section-header">
            <span className="material-symbols-outlined">info</span>
            <h2>Información Básica</h2>
          </div>
          <div className="create-form-grid">
            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">TÍTULO DEL ÁLBUM</span>
              <input
                type="text"
                className="album-form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Cantos de Esperanza"
                maxLength={120}
                required
                disabled={submitting}
              />
            </label>

            <label className="create-form-field">
              <span className="album-form-label">AÑO DE LANZAMIENTO</span>
              <input
                type="number"
                className="album-form-input"
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                placeholder="2024"
                min="1900"
                max="2100"
                disabled={submitting}
              />
            </label>

            <label className="create-form-field">
              <span className="album-form-label">GÉNERO</span>
              <select
                className="album-form-select"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                required
                disabled={submitting}
              >
                <option value="">Seleccionar género</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>

            <label className="create-form-field">
              <span className="album-form-label">TIPO DE ÁLBUM</span>
              <select
                className="album-form-select"
                value={albumType}
                onChange={(e) => setAlbumType(e.target.value as AlbumType)}
                disabled={submitting}
              >
                {ALBUM_TYPES.map((type) => (
                  <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Artist Link Card */}
        <section className="album-section-card">
          <div className="album-section-header">
            <span className="material-symbols-outlined">group</span>
            <h2>Enlace de Artista</h2>
          </div>
          <div className="create-form-field create-form-field--full">
            <ArtistAutocomplete
              value={artistOption}
              onChange={(artist) => {
                setArtistOption(artist);
              }}
              label="BUSCAR ARTISTA REGISTRADO"
              placeholder="Escribe el nombre del artista..."
              required
              disabled={submitting}
            />
          </div>
        </section>

        {/* Cover Upload Card */}
        <section className="album-section-card">
          <div className="album-section-header">
            <span className="material-symbols-outlined">image</span>
            <h2>Portada del Álbum</h2>
          </div>
          <label className="album-cover-dropzone" htmlFor="album-cover-upload">
            <input
              key={coverInputKey}
              id="album-cover-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            {coverPreview ? (
              <div className="album-cover-preview">
                <Image src={coverPreview} alt="Vista previa" width={200} height={200} />
                <small>Clic para cambiar</small>
              </div>
            ) : (
              <>
                <div className="album-cover-icon">
                  <span className="material-symbols-outlined">upload_file</span>
                </div>
                <div className="album-cover-placeholder">
                  <strong>Arrastra y suelta la imagen aquí</strong>
                  <small>o haz clic para explorar. PNG, JPG (Max 5MB)</small>
                </div>
              </>
            )}
          </label>
        </section>

        {/* Track Manager Card */}
        <section className="album-track-manager">
          <div className="album-track-manager-header">
            <h2>
              <span className="material-symbols-outlined">queue_music</span>
              Gestor de Pistas
            </h2>
            
            {artistOption ? (
              <>
                <div className="album-track-search">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    className="album-form-input"
                    value={songSearchInput}
                    onChange={(e) => {
                      setSongSearchInput(e.target.value);
                      if (!isSearchOpen) setIsSearchOpen(true);
                    }}
                    onFocus={() => {
                      if (songSearchInput || searchOptions.length > 0) setIsSearchOpen(true);
                    }}
                    placeholder="Buscar canciones del artista seleccionado..."
                    disabled={submitting}
                  />
                </div>

                {isSearchOpen && highlightableOptions.length > 0 && (
                  <div className="album-track-dropdown">
                    {highlightableOptions.map((song, index) => (
                      <div
                        key={song.sqlSongId}
                        className={`album-track-option ${index === highlightedOptionIndex ? 'highlighted' : ''}`}
                        onClick={() => handleSelectSong(song)}
                        onMouseEnter={() => setHighlightedOptionIndex(index)}
                      >
                        <div>
                          <p className="album-track-option-title">{song.title}</p>
                          <p className="album-track-option-id">ID: {song.songId}</p>
                        </div>
                        <button type="button" className="album-track-option-add">
                          <span className="material-symbols-outlined">add</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="album-track-empty">Selecciona un artista para ver sus canciones disponibles.</p>
            )}
          </div>

          {addedTracks.length > 0 && (
            <div className="album-track-list-container">
              <h3 className="album-track-list-header">PISTAS AÑADIDAS</h3>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="album-tracks">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="album-track-list"
                    >
                      {addedTracks.map((track, index) => (
                        <Draggable key={track.songId} draggableId={track.songId} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`album-track-item ${snapshot.isDragging ? 'dragging' : ''}`}
                            >
                              <span className="album-track-number">
                                {String(track.trackNumber).padStart(2, '0')}
                              </span>
                              <div className="album-track-content">
                                <p className="album-track-title">{track.songTitle}</p>
                                {track.versionName && (
                                  <span className="album-track-version">{track.versionName}</span>
                                )}
                              </div>
                              <div className="album-track-actions">
                                <button
                                  type="button"
                                  className="album-track-drag-handle"
                                  {...provided.dragHandleProps}
                                >
                                  <span className="material-symbols-outlined">drag_indicator</span>
                                </button>
                                <button
                                  type="button"
                                  className="album-track-remove"
                                  onClick={() => handleRemoveTrack(track.songId)}
                                  disabled={submitting}
                                >
                                  <span className="material-symbols-outlined">delete</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}
        </section>

        {errorMessage ? <p className="create-form-error">{errorMessage}</p> : null}
        {successMessage ? <p className="create-form-success">{successMessage}</p> : null}

        <div className="create-form-actions album-form-actions">
          <button
            type="button"
            className="create-form-cancel"
            onClick={handleClear}
            disabled={submitting}
          >
            Cancelar
          </button>

          <button type="submit" className="create-form-submit" disabled={!canSubmit}>
            <span className="material-symbols-outlined">save</span>
            {submitting ? 'Guardando...' : 'Guardar Álbum'}
          </button>
        </div>
      </form>
    </section>
  );
}

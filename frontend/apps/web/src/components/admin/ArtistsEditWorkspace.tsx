'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../features/auth/repository';
import {
  getArtistForAdmin,
  updateArtist,
  softDeleteArtist,
  hardDeleteArtist,
  type ArtistDetail
} from '../../features/admin/repository';
import { prepareCoverImageFileOriginalSize, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { CropperModal } from '../ui/CropperModal';
import { FloatingStatusOverlay, type FloatingStatusState } from '../ui/FloatingStatusOverlay';
import { LoadingBubble } from '../ui/LoadingBubble';
import { capitalizeFirstLetter } from '../../features/shared/textFormat';

const ARTIST_TYPES = ['General', 'Litúrgico', 'Contemporáneo', 'Tradicional', 'Instrumental'];
const COMMON_GENRES = ['Litúrgico', 'Contemporáneo', 'Tradicional', 'Instrumental', 'Alabanza', 'Adoración', 'Coro'];
const COMMON_CATEGORIES = ['Misa', 'Coro', 'Grupo', 'Solista', 'Orquesta'];

export function ArtistsEditWorkspace({ artistId }: { artistId: number }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Artist data
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loadingArtist, setLoadingArtist] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [bio, setBio] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [images, setImages] = useState<Array<{ url: string; width?: number; height?: number }>>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isOfficial, setIsOfficial] = useState(false);

  // Image upload state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [coverInputKey, setCoverInputKey] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string>('');


  // UI state
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHardDeleteConfirm, setShowHardDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = isAdminUser(user);

  // Load artist data
  useEffect(() => {
    if (!canManage || !artistId) {
      setLoadingArtist(false);
      return;
    }

    let alive = true;

    const loadArtist = async () => {
      setLoadingArtist(true);
      setError(null);
      try {
        // console.log('Loading artist with ID:', artistId);
        const data = await getArtistForAdmin(artistId);
        // console.log('Artist data loaded:', data);
        if (!alive) return;
        setArtist(data);
        setName(data.name);
        setType(data.type);
        setBio(data.bio || '');
        setImageUrl(data.imageUrl || '');
        setImages(data.images || []);
        setGenres(data.genres || []);
        setCategories(data.categories || []);
        setIsOfficial(data.isOfficial);
      } catch (err) {
        // console.error('Error loading artist:', err);
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el artista.');
      } finally {
        if (alive) {
          setLoadingArtist(false);
        }
      }
    };

    void loadArtist();

    return () => {
      alive = false;
    };
  }, [canManage, artistId]);

  const handleCoverChange = async (file: File | null) => {
    if (!file) {
      setCoverFile(null);
      setCoverPreview('');
      return;
    }

    const result = await prepareCoverImageFileOriginalSize(file);
    if (result.ok) {
      setImageToCrop(URL.createObjectURL(result.file));
      setShowCropper(true);
    } else {
      setError('Error al procesar la imagen.');
    }
  };

  const handleCropConfirm = (croppedFile: File) => {
    setCoverFile(croppedFile);
    setCoverPreview(URL.createObjectURL(croppedFile));
    setShowCropper(false);
    setImageToCrop('');
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setImageToCrop('');
  };

  const handleAddGenre = (genre: string) => {
    if (genre && !genres.includes(genre)) {
      setGenres([...genres, genre]);
    }
  };

  const handleRemoveGenre = (genre: string) => {
    setGenres(genres.filter(g => g !== genre));
  };

  const handleAddCategory = (category: string) => {
    if (category && !categories.includes(category)) {
      setCategories([...categories, category]);
    }
  };

  const handleRemoveCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
  };

  const handleAddImage = (url: string) => {
    if (url && !images.find(img => img.url === url)) {
      setImages([...images, { url }]);
    }
  };

  const handleRemoveImage = (url: string) => {
    setImages(images.filter(img => img.url !== url));
  };

  const handleSave = async () => {
    if (!artist) return;

    setSaving(true);
    setError(null);
    setSuccessMessage('');

    try {
      // Upload image if provided
      let finalImageUrl = imageUrl;
      if (coverFile) {
        setUploadingImage(true);
        try {
          const uploadResult = await uploadCoverImage({
            file: coverFile,
            entity: 'artists',
            entityId: String(artist.id)
          });
          if (uploadResult.ok && uploadResult.url) {
            finalImageUrl = uploadResult.url;
            setImageUrl(uploadResult.url);
          }
        } catch {
          setError('Error al subir la imagen.');
          setSaving(false);
          setUploadingImage(false);
          return;
        } finally {
          setUploadingImage(false);
        }
      }

      const updated = await updateArtist(artist.id, {
        name: capitalizeFirstLetter(name.trim()),
        type,
        bio: bio.trim() || null,
        imageUrl: finalImageUrl,
        images,
        genres,
        categories,
        isOfficial
      });

      setArtist(updated);
      setSuccessMessage('Artista actualizado correctamente.');
      setCoverFile(null);
      setCoverPreview('');
      setCoverInputKey(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el artista.');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!artist) return;

    setDeleting(true);
    setError(null);

    try {
      await softDeleteArtist(artist.id);
      setSuccessMessage('Artista desactivado correctamente.');
      setShowDeleteConfirm(false);
      if (artist) {
        const updated = await getArtistForAdmin(artist.id);
        setArtist(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desactivar el artista.');
    } finally {
      setDeleting(false);
    }
  };

  const handleHardDelete = async () => {
    if (!artist) return;

    setDeleting(true);
    setError(null);

    try {
      await hardDeleteArtist(artist.id);
      setSuccessMessage('Artista eliminado permanentemente.');
      setShowHardDeleteConfirm(false);
      setTimeout(() => {
        router.push('/admin');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el artista.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingBubble isLoading={true} message="Cargando permisos…" showDelay={0} />;
  }

  if (!canManage) {
    return (
      <section className="admin-panel-shell layout-h-margin">
        <header className="admin-panel-hero">
          <div>
            <span className="admin-panel-kicker">Editar Artista</span>
            <h1>Acceso restringido</h1>
            <p>Solo las cuentas con rol admin pueden editar artistas.</p>
          </div>
          <button type="button" className="admin-primary-button" onClick={() => router.push('/admin')}>
            Volver al panel
          </button>
        </header>
      </section>
    );
  }

  if (loadingArtist) {
    return <LoadingBubble isLoading={true} message="Cargando artista…" showDelay={0} />;
  }

  if (error && !artist) {
    return (
      <section className="admin-panel-shell layout-h-margin">
        <header className="admin-panel-hero">
          <div>
            <span className="admin-panel-kicker">Editar Artista</span>
            <h1>Error</h1>
            <p>{error}</p>
          </div>
          <button type="button" className="admin-primary-button" onClick={() => router.push('/admin')}>
            Volver al panel
          </button>
        </header>
      </section>
    );
  }

  const overlayState: FloatingStatusState = uploadingImage ? 'uploading' : saving ? 'updating' : deleting ? 'updating' : successMessage ? 'success' : error ? 'error' : 'idle';
  const overlayMessage = uploadingImage ? 'Subiendo imagen...' : saving ? 'Guardando cambios...' : deleting ? 'Eliminando artista...' : error ?? (successMessage || '');

  return (
    <section className="admin-panel-shell layout-h-margin">
      <LoadingBubble isLoading={saving || uploadingImage || deleting} message={uploadingImage ? 'Subiendo imagen…' : deleting ? 'Eliminando artista…' : 'Guardando cambios…'} />
      <header className="admin-panel-hero">
        <div>
          <span className="admin-panel-kicker">Editar Artista</span>
          <h1>{artist?.name || 'Artista'}</h1>
          <p>Edita la información básica, imágenes, géneros y categorías del artista.</p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => router.push('/admin')}>
          Volver al panel
        </button>
      </header>

      {successMessage ? <p className="create-form-success admin-panel-feedback">{successMessage}</p> : null}
      {error ? <p className="create-form-error admin-panel-feedback">{error}</p> : null}

      <section className="admin-columns">
        {/* Basic Info Card */}
        <article className="admin-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Información Básica</span>
              <h2>Detalles del Artista</h2>
            </div>
          </div>

          <div className="create-form-grid">
            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">NOMBRE</span>
              <input
                type="text"
                className="album-form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                disabled={saving}
                placeholder="Nombre del artista"
              />
            </label>

            <label className="create-form-field">
              <span className="album-form-label">TIPO</span>
              <select
                className="album-form-select"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={saving}
              >
                {ARTIST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="create-form-field">
              <span className="album-form-label">ESTADO</span>
              <span className={`admin-status-pill ${artist?.status === 'active' ? 'is-approved' : 'is-rejected'}`}>
                {artist?.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
            </label>

            <label className="create-form-field">
              <span className="album-form-label">OFICIAL</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={isOfficial}
                  onChange={(e) => setIsOfficial(e.target.checked)}
                  disabled={saving}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Marcar como artista oficial</span>
              </div>
            </label>

            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">BIOGRAFÍA</span>
              <textarea
                className="album-form-input"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                disabled={saving}
                placeholder="Descripción breve del artista..."
                style={{ resize: 'vertical' }}
              />
            </label>
          </div>
        </article>

        {/* Metrics Card */}
        <article className="admin-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Métricas</span>
              <h2>Estadísticas</h2>
            </div>
          </div>

          <div className="admin-artist-metrics-grid">
            <div className="admin-artist-metric-card">
              <div className="admin-artist-metric-icon">
                <span className="material-symbols-outlined">favorite</span>
              </div>
              <span className="admin-artist-metric-label">Fans</span>
              <strong className="admin-artist-metric-value">{artist?.likeCount?.toLocaleString() || '0'}</strong>
            </div>
            <div className="admin-artist-metric-card">
              <div className="admin-artist-metric-icon">
                <span className="material-symbols-outlined">visibility</span>
              </div>
              <span className="admin-artist-metric-label">Vistas</span>
              <strong className="admin-artist-metric-value">{artist?.totalViews?.toLocaleString() || '0'}</strong>
            </div>
            <div className="admin-artist-metric-card">
              <div className="admin-artist-metric-icon">
                <span className="material-symbols-outlined">trending_up</span>
              </div>
              <span className="admin-artist-metric-label">Popularidad</span>
              <strong className="admin-artist-metric-value">{artist?.popularity || 0}%</strong>
            </div>
          </div>
        </article>
      </section>

      {/* Images Card */}
      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Imágenes</span>
            <h2>Imagen del Artista</h2>
          </div>
        </div>

        <div className="create-form-grid">
          <div className="create-form-field create-form-field--full">
            <span className="album-form-label">SUBIR IMAGEN</span>
            <label
              className={`admin-artist-upload-zone ${saving || uploadingImage ? 'disabled' : ''}`}
            >
              <input
                ref={fileInputRef}
                key={coverInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
                disabled={saving || uploadingImage}
                className="admin-file-input"
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', pointerEvents: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>
                  cloud_upload
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  {uploadingImage ? 'Subiendo...' : 'Haz clic o arrastra una imagen'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  JPEG, PNG, WebP (máx. 5MB)
                </span>
              </div>
            </label>
          </div>

          {coverPreview && (
            <div className="create-form-field create-form-field--full">
              <span className="album-form-label">VISTA PREVIA</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverPreview} alt="Vista previa" className="admin-artist-preview" />
            </div>
          )}

          <label className="create-form-field create-form-field--full">
            <span className="album-form-label">URL DE IMAGEN</span>
            <input
              type="text"
              className="album-form-input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              disabled={saving}
            />
          </label>

          {images.length > 0 && (
            <div className="create-form-field create-form-field--full">
              <span className="album-form-label">IMÁGENES ADICIONALES</span>
              <div className="admin-artist-image-grid">
                {images.map((img, idx) => (
                  <div key={idx} className="admin-artist-image-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`Imagen ${idx}`} />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.url)}
                      disabled={saving}
                      className="admin-artist-image-remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="create-form-field create-form-field--full">
            <span className="album-form-label">AGREGAR IMAGEN ADICIONAL</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="album-form-input"
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddImage(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
                disabled={saving}
              />
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  const input = document.querySelector('input[placeholder="https://..."]') as HTMLInputElement;
                  if (input) {
                    handleAddImage(input.value);
                    input.value = '';
                  }
                }}
                disabled={saving}
              >
                Agregar
              </button>
            </div>
          </label>
        </div>
      </section>

      {/* Genres and Categories */}
      <section className="admin-columns">
        <article className="admin-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Géneros</span>
              <h2>Géneros Musicales</h2>
            </div>
          </div>

          <div className="create-form-grid">
            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">GÉNEROS SELECCIONADOS</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px' }}>
                {genres.length === 0 ? (
                  <span style={{ color: '#9ca3af', fontSize: '14px' }}>No hay géneros seleccionados</span>
                ) : (
                  genres.map((genre) => (
                    <span key={genre} className="admin-status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {genre}
                      <button
                        type="button"
                        onClick={() => handleRemoveGenre(genre)}
                        disabled={saving}
                        style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </label>

            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">AGREGAR GÉNERO</span>
              <select
                className="album-form-select"
                onChange={(e) => {
                  handleAddGenre(e.target.value);
                  e.target.value = '';
                }}
                disabled={saving}
                value=""
              >
                <option value="">Seleccionar género...</option>
                {COMMON_GENRES.filter(g => !genres.includes(g)).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-section-head">
            <div>
              <span className="admin-panel-kicker">Categorías</span>
              <h2>Categorías del Artista</h2>
            </div>
          </div>

          <div className="create-form-grid">
            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">CATEGORÍAS SELECCIONADAS</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px' }}>
                {categories.length === 0 ? (
                  <span style={{ color: '#9ca3af', fontSize: '14px' }}>No hay categorías seleccionadas</span>
                ) : (
                  categories.map((category) => (
                    <span key={category} className="admin-status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {category}
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(category)}
                        disabled={saving}
                        style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </label>

            <label className="create-form-field create-form-field--full">
              <span className="album-form-label">AGREGAR CATEGORÍA</span>
              <select
                className="album-form-select"
                onChange={(e) => {
                  handleAddCategory(e.target.value);
                  e.target.value = '';
                }}
                disabled={saving}
                value=""
              >
                <option value="">Seleccionar categoría...</option>
                {COMMON_CATEGORIES.filter(c => !categories.includes(c)).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        </article>
      </section>

      {/* Discography Card */}
      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Discografía</span>
            <h2>Álbumes del Artista</h2>
          </div>
          <button
            type="button"
            className="admin-primary-button"
            onClick={() => router.push(`/admin/albums/create?artistId=${artistId}`)}
          >
            <span className="material-symbols-outlined">add</span>
            Crear Álbum
          </button>
        </div>

        <p className="admin-note">
          Gestiona los álbumes de este artista. Los álbumes se crean y editan en el workspace de álbumes.
        </p>
      </section>

      {/* Actions */}
      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <span className="admin-panel-kicker">Acciones</span>
            <h2>Guardar y Eliminar</h2>
          </div>
        </div>

        <div className="admin-artist-actions">
          <button
            type="button"
            className="admin-primary-button"
            onClick={handleSave}
            disabled={saving || uploadingImage}
          >
            <span className="material-symbols-outlined">save</span>
            {uploadingImage ? 'Subiendo imagen...' : saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>

          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving || deleting}
          >
            <span className="material-symbols-outlined">block</span>
            Desactivar Artista
          </button>

          <button
            type="button"
            className="admin-danger-button"
            onClick={() => setShowHardDeleteConfirm(true)}
            disabled={saving || deleting}
          >
            <span className="material-symbols-outlined">delete_forever</span>
            Eliminar Permanentemente
          </button>
        </div>
      </section>

      {/* Soft Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', maxWidth: '400px' }}>
            <h3>¿Desactivar artista?</h3>
            <p>El artista será marcado como inactivo y no aparecerá en búsquedas públicas.</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-danger-button"
                onClick={handleSoftDelete}
                disabled={deleting}
              >
                {deleting ? 'Desactivando...' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Confirm Modal */}
      {showHardDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', maxWidth: '400px' }}>
            <h3>¿Eliminar permanentemente?</h3>
            <p>Esta acción eliminará el artista de la base de datos. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setShowHardDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-danger-button"
                onClick={handleHardDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      <CropperModal
        isOpen={showCropper}
        imageSrc={imageToCrop}
        aspectRatio={1}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />

      <FloatingStatusOverlay
        state={overlayState}
        message={overlayMessage}
        autoDismiss={overlayState === 'success' ? 3000 : 0}
        onDismiss={() => { setError(null); setSuccessMessage(''); }}
      />
    </section>
  );
}

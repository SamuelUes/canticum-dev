'use client';

import { collection, doc } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchSongsByArtist, type ArtistSongLookup } from '../../features/artist/repository';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import {
  requestCreateSong,
  type CreateSongPayload,
  type CreateSongPayloadVersion
} from '../../features/song/clientPersistence';
import { uploadInstrumentationAsset, uploadVersionAsset } from '../../features/song/versionAssetUpload';
import { prepareCoverImageFileOriginalSize, uploadCoverImage } from '../../features/uploads/coverImageUpload';
import { CropperModal } from '../ui/CropperModal';
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
  'Navidad',
  'General'
];

const LITURGICAL_TIMES = [
  'Ordinario',
  'Extraordinario',
  'Cuaresma',
  'Adviento',
  'Navidad',
  'Pascua'
];

const NOTATION_TYPES = ['Cifrado', 'Partitura', 'Tablatura', 'Ninguno'];

type WorkspaceMode = 'new' | 'addVersion';

interface DraftInstrumentation {
  localId: string;
  docId: string;
  instrumentName: string;
  lyrics: string;
  lyricsFile: File | null;
  sheetFile: File | null;
  audioFile: File | null;
  audioReferenceUrl: string;
  tone: string;
  notationType: string;
}

interface DraftVersion {
  localId: string;
  /** Pre-generated Firestore version doc id (used for Storage paths and backend). */
  docId: string;
  versionName: string;
  artistOption: ArtistOption | null;
  artistText: string;
  isOwnVersion: boolean;
  audioMode: 'shared' | 'per_instrumentation';
  audioFile: File | null;
  audioReferenceUrl: string;
  instrumentations: DraftInstrumentation[];
  // Legacy fields for backward compatibility
  instrumentName?: string;
  tone?: string;
  notationType?: string;
  lyrics?: string;
  lyricsFile?: File | null;
  sheetFile?: File | null;
}

function generateFirestoreDocId(collectionPath: string): string {
  // Uses Firestore's auto-id generator without writing to the database.
  if (!db) {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return doc(collection(db, collectionPath)).id;
}

function createEmptyInstrumentation(versionDocId: string, seed: number): DraftInstrumentation {
  return {
    localId: `inst-${seed}-${Date.now()}`,
    docId: generateFirestoreDocId(`songs/${versionDocId}/instrumentations`),
    instrumentName: 'Letra',
    lyrics: '',
    lyricsFile: null,
    sheetFile: null,
    audioFile: null,
    audioReferenceUrl: '',
    tone: '',
    notationType: ''
  };
}

function createEmptyVersion(seed: number, songDocId: string): DraftVersion {
  const versionDocId = generateFirestoreDocId(`songs/${songDocId}/versions`);
  return {
    localId: `version-${seed}-${Date.now()}`,
    docId: versionDocId,
    versionName: `Versión ${seed}`,
    artistOption: null,
    artistText: '',
    isOwnVersion: true,
    audioMode: 'shared',
    audioFile: null,
    audioReferenceUrl: '',
    instrumentations: [createEmptyInstrumentation(versionDocId, seed)],
    // Legacy fields for backward compatibility
    instrumentName: 'Letra',
    tone: '',
    notationType: '',
    lyrics: '',
    lyricsFile: null,
    sheetFile: null
  };
}

function hasTrimmedValue(value: string | null | undefined): boolean {
  return Boolean(typeof value === 'string' && value.trim());
}

function getVersionAudioDiagnostics(version: DraftVersion) {
  const sharedAudio = {
    hasFile: Boolean(version.audioFile),
    hasUrl: hasTrimmedValue(version.audioReferenceUrl),
    source: hasTrimmedValue(version.audioReferenceUrl)
      ? 'url'
      : (version.audioFile ? 'file' : 'missing')
  } as const;

  const instrumentationAudio = version.instrumentations.map((inst) => ({
    localId: inst.localId,
    docId: inst.docId,
    instrumentName: inst.instrumentName,
    hasFile: Boolean(inst.audioFile),
    hasUrl: hasTrimmedValue(inst.audioReferenceUrl),
    source: hasTrimmedValue(inst.audioReferenceUrl)
      ? 'url'
      : (inst.audioFile ? 'file' : 'missing')
  } as const));

  return {
    audioMode: version.audioMode,
    sharedAudio,
    instrumentationAudio,
    requiredAudioSatisfied: version.audioMode === 'shared'
      ? sharedAudio.source !== 'missing'
      : instrumentationAudio.every((inst) => inst.source !== 'missing')
  };
}

function versionHasRequiredAudio(version: DraftVersion): boolean {
  return getVersionAudioDiagnostics(version).requiredAudioSatisfied;
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
  const [liturgicalTime, setLiturgicalTime] = useState('');

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
      clearCoverPreviewUrl();
      setCoverError('');
      setCoverPreparing(false);
    }
    // For addVersion, songDocId follows selectedExistingSongId (see below).
  }, [clearCoverPreviewUrl, mode]);

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

  // ── Validation ──

  const hasSongArtist = mode === 'new'
    ? Boolean(songArtistOption?.id || songArtistText.trim())
    : Boolean(existingArtistOption?.id);
  const hasTargetSong = mode === 'new' ? title.trim().length > 0 : Boolean(selectedExistingSongId);
  const hasValidVersions = versions.length > 0
    && versions.every((version) => {
      const hasVersionArtist = version.isOwnVersion || Boolean(version.artistOption?.id || version.artistText.trim());
      const hasAudio = versionHasRequiredAudio(version);
      const hasInstrumentations = version.instrumentations.length > 0
        && version.instrumentations.every((inst) => inst.instrumentName.trim().length > 0);
      return Boolean(
        version.versionName.trim() &&
        hasVersionArtist &&
        hasAudio &&
        hasInstrumentations
      );
    });

  const canSubmit = hasTargetSong && hasSongArtist && hasValidVersions && !submitting && !coverPreparing;

  const logSubmitError = (stage: string, message: string, details: Record<string, unknown> = {}) => {
    console.error('[CreateSongWorkspace] song creation error', {
      stage,
      message,
      mode,
      songDocId,
      selectedExistingSongId,
      coverSelected: Boolean(coverFile),
      versions: versions.map((version) => ({
        localId: version.localId,
        docId: version.docId,
        versionName: version.versionName,
        audioMode: version.audioMode,
        audioDiagnostics: getVersionAudioDiagnostics(version)
      })),
      ...details
    });
  };

  const updateVersion = (localId: string, update: Partial<DraftVersion>) => {
    setVersions((prev) => prev.map((version) => (
      version.localId === localId ? { ...version, ...update } : version
    )));
  };

  const updateInstrumentation = (versionLocalId: string, instLocalId: string, update: Partial<DraftInstrumentation>) => {
    setVersions((prev) => prev.map((version) => {
      if (version.localId !== versionLocalId) return version;
      return {
        ...version,
        instrumentations: version.instrumentations.map((inst) =>
          inst.localId === instLocalId ? { ...inst, ...update } : inst
        )
      };
    }));
  };

  const addInstrumentation = (versionLocalId: string) => {
    setVersions((prev) => prev.map((version) => {
      if (version.localId !== versionLocalId) return version;
      const seed = version.instrumentations.length + 1;
      return {
        ...version,
        instrumentations: [...version.instrumentations, createEmptyInstrumentation(version.docId, seed)]
      };
    }));
  };

  const removeInstrumentation = (versionLocalId: string, instLocalId: string) => {
    setVersions((prev) => prev.map((version) => {
      if (version.localId !== versionLocalId) return version;
      if (version.instrumentations.length <= 1) return version; // Keep at least one
      return {
        ...version,
        instrumentations: version.instrumentations.filter((inst) => inst.localId !== instLocalId)
      };
    }));
  };

  const handleCoverSelection = async (file: File | null) => {
    setCoverError('');

    if (!file) {
      setCoverFile(null);
      clearCoverPreviewUrl();
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
      if (liturgicalTime) payload.liturgicalTime = liturgicalTime;
    } else {
      payload.songId = selectedExistingSongId;
    }

    const resolvedVersions: CreateSongPayloadVersion[] = [];

    let coverImageUrl: string | undefined;
    let coverVersionDocId: string | undefined;

    if (mode === 'new' && coverFile) {
      coverVersionDocId = versions[0]?.docId;
      if (!coverVersionDocId) {
        logSubmitError('cover_version_resolution', 'No se pudo resolver la versión para guardar la portada.');
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
        logSubmitError('cover_upload', coverResult.error ?? 'No se pudo subir la portada.', {
          coverVersionDocId,
          coverFileName: coverFile.name,
          coverFileSize: coverFile.size,
          coverFileType: coverFile.type
        });
        setSubmitting(false);
        setErrorMessage(coverResult.error ?? 'No se pudo subir la portada.');
        return;
      }

      coverImageUrl = coverResult.url;
    }

    for (const version of versions) {
      // 1) Audio by mode.
      let sharedAudioUrl: string | undefined;
      if (version.audioMode === 'shared') {
        sharedAudioUrl = version.audioReferenceUrl.trim();
        if (!sharedAudioUrl && version.audioFile) {
          const result = await uploadVersionAsset({
            file: version.audioFile,
            songId: targetSongId,
            versionId: version.docId,
            kind: 'audio',
            filenameBase: version.versionName.trim() || 'audio'
          });
          if (!result.ok || !result.url) {
            logSubmitError('shared_audio_upload', result.error ?? 'No se pudo subir el audio compartido de una versión.', {
              versionDocId: version.docId,
              versionLocalId: version.localId,
              versionName: version.versionName,
              audioMode: version.audioMode,
              audioFileName: version.audioFile.name,
              audioFileSize: version.audioFile.size,
              audioFileType: version.audioFile.type,
              audioDiagnostics: getVersionAudioDiagnostics(version)
            });
            setSubmitting(false);
            setErrorMessage(result.error ?? 'No se pudo subir el audio compartido de una versión.');
            return;
          }
          sharedAudioUrl = result.url;
        }
        if (!sharedAudioUrl) {
          logSubmitError('shared_audio_missing', 'Cada versión debe incluir audio (archivo o URL) en modo compartido.', {
            versionDocId: version.docId,
            versionLocalId: version.localId,
            versionName: version.versionName,
            audioMode: version.audioMode,
            audioReferenceUrl: version.audioReferenceUrl,
            audioDiagnostics: getVersionAudioDiagnostics(version)
          });
          setSubmitting(false);
          setErrorMessage('Cada versión debe incluir audio (archivo o URL) en modo compartido.');
          return;
        }
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
          logSubmitError('version_lyrics_upload', result.error ?? 'No se pudo subir la letra (archivo) de una versión.', {
            versionDocId: version.docId,
            versionLocalId: version.localId,
            versionName: version.versionName,
            lyricsFileName: version.lyricsFile.name,
            lyricsFileSize: version.lyricsFile.size,
            lyricsFileType: version.lyricsFile.type
          });
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
          logSubmitError('version_sheet_upload', result.error ?? 'No se pudo subir la partitura de una versión.', {
            versionDocId: version.docId,
            versionLocalId: version.localId,
            versionName: version.versionName,
            sheetFileName: version.sheetFile.name,
            sheetFileSize: version.sheetFile.size,
            sheetFileType: version.sheetFile.type
          });
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

      const instrumentations = [];
      for (const inst of version.instrumentations) {
        let instLyricsFileUrl: string | undefined;
        let instSheetFileUrl: string | undefined;
        let instAudioUrl: string | undefined;

        if (inst.lyricsFile) {
          const result = await uploadInstrumentationAsset({
            file: inst.lyricsFile,
            songId: targetSongId,
            versionId: version.docId,
            instrumentationId: inst.docId,
            kind: 'lyrics',
            filenameBase: `${inst.instrumentName.trim() || 'instrumentation'}-lyrics`
          });
          if (!result.ok || !result.url) {
            logSubmitError('instrumentation_lyrics_upload', result.error ?? `No se pudo subir la letra de la instrumentación "${inst.instrumentName}".`, {
              versionDocId: version.docId,
              versionLocalId: version.localId,
              instrumentationDocId: inst.docId,
              instrumentationLocalId: inst.localId,
              instrumentationName: inst.instrumentName,
              lyricsFileName: inst.lyricsFile.name,
              lyricsFileSize: inst.lyricsFile.size,
              lyricsFileType: inst.lyricsFile.type
            });
            setSubmitting(false);
            setErrorMessage(result.error ?? `No se pudo subir la letra de la instrumentación "${inst.instrumentName}".`);
            return;
          }
          instLyricsFileUrl = result.url;
        }

        if (inst.sheetFile) {
          const result = await uploadInstrumentationAsset({
            file: inst.sheetFile,
            songId: targetSongId,
            versionId: version.docId,
            instrumentationId: inst.docId,
            kind: 'sheet',
            filenameBase: `${inst.instrumentName.trim() || 'instrumentation'}-sheet`
          });
          if (!result.ok || !result.url) {
            logSubmitError('instrumentation_sheet_upload', result.error ?? `No se pudo subir la partitura de la instrumentación "${inst.instrumentName}".`, {
              versionDocId: version.docId,
              versionLocalId: version.localId,
              instrumentationDocId: inst.docId,
              instrumentationLocalId: inst.localId,
              instrumentationName: inst.instrumentName,
              sheetFileName: inst.sheetFile.name,
              sheetFileSize: inst.sheetFile.size,
              sheetFileType: inst.sheetFile.type
            });
            setSubmitting(false);
            setErrorMessage(result.error ?? `No se pudo subir la partitura de la instrumentación "${inst.instrumentName}".`);
            return;
          }
          instSheetFileUrl = result.url;
        }

        if (version.audioMode === 'per_instrumentation') {
          instAudioUrl = inst.audioReferenceUrl.trim();
          if (!instAudioUrl && inst.audioFile) {
            const result = await uploadInstrumentationAsset({
              file: inst.audioFile,
              songId: targetSongId,
              versionId: version.docId,
              instrumentationId: inst.docId,
              kind: 'audio',
              filenameBase: `${inst.instrumentName.trim() || 'instrumentation'}-audio`
            });
            if (!result.ok || !result.url) {
              logSubmitError('instrumentation_audio_upload', result.error ?? `No se pudo subir el audio de la instrumentación "${inst.instrumentName}".`, {
                versionDocId: version.docId,
                versionLocalId: version.localId,
                instrumentationDocId: inst.docId,
                instrumentationLocalId: inst.localId,
                instrumentationName: inst.instrumentName,
                audioFileName: inst.audioFile.name,
                audioFileSize: inst.audioFile.size,
                audioFileType: inst.audioFile.type
              });
              setSubmitting(false);
              setErrorMessage(result.error ?? `No se pudo subir el audio de la instrumentación "${inst.instrumentName}".`);
              return;
            }
            instAudioUrl = result.url;
          }
          if (!instAudioUrl) {
            logSubmitError('instrumentation_audio_missing', `La instrumentación "${inst.instrumentName}" debe incluir audio (archivo o URL) en modo por instrumentación.`, {
              versionDocId: version.docId,
              versionLocalId: version.localId,
              instrumentationDocId: inst.docId,
              instrumentationLocalId: inst.localId,
              instrumentationName: inst.instrumentName,
              audioReferenceUrl: inst.audioReferenceUrl,
              hasAudioFile: Boolean(inst.audioFile)
            });
            setSubmitting(false);
            setErrorMessage(`La instrumentación "${inst.instrumentName}" debe incluir audio (archivo o URL) en modo por instrumentación.`);
            return;
          }
        }

        instrumentations.push({
          instrumentationId: inst.docId,
          instrumentName: inst.instrumentName.trim(),
          lyrics: inst.lyrics.trim() || undefined,
          lyricsFileUrl: instLyricsFileUrl,
          sheetFileUrl: instSheetFileUrl,
          audioReferenceUrl: version.audioMode === 'per_instrumentation' ? (instAudioUrl || undefined) : undefined,
          tone: inst.tone.trim() || undefined,
          notationType: inst.notationType || undefined
        });
      }

      resolvedVersions.push({
        versionDocId: version.docId,
        versionName: version.versionName.trim(),
        artistId: versionArtistId,
        artistName: versionArtistName,
        isOwnVersion: version.isOwnVersion,
        audioMode: version.audioMode,
        audioReferenceUrl: version.audioMode === 'shared' ? sharedAudioUrl : undefined,
        instrumentations,
        // Legacy fields for backward compatibility
        instrumentName: version.instrumentName?.trim() || 'Letra',
        tone: version.tone?.trim() || undefined,
        notationType: version.notationType || undefined,
        lyrics: version.lyrics?.trim() || undefined,
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
        clearCoverPreviewUrl();
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
      logSubmitError('create_song_request_failed', result.message ?? messages[result.reason ?? 'unknown'] ?? messages.unknown, {
        reason: result.reason,
        backendMessage: result.message,
        payloadVersions: resolvedVersions.length,
        payloadHasCoverImageUrl: Boolean(payload.coverImageUrl),
        payloadAudioModes: resolvedVersions.map((version) => ({
          versionDocId: version.versionDocId,
          audioMode: version.audioMode,
          hasSharedAudioUrl: Boolean(version.audioReferenceUrl),
          instrumentationAudioCount: version.instrumentations?.filter((inst) => Boolean(inst.audioReferenceUrl)).length ?? 0
        }))
      });
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

            <label className="create-form-field">
              <span>Tiempo Litúrgico</span>
              <select value={liturgicalTime} onChange={(e) => setLiturgicalTime(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {LITURGICAL_TIMES.map((time) => (
                  <option key={time} value={time}>{time}</option>
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
                  <span>Modo de audio *</span>
                  <select
                    value={version.audioMode}
                    onChange={(e) => updateVersion(version.localId, { audioMode: e.target.value as 'shared' | 'per_instrumentation' })}
                    disabled={submitting}
                  >
                    <option value="shared">Audio compartido (una pista para todos)</option>
                    <option value="per_instrumentation">Audio por instrumentación</option>
                  </select>
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

                {/* <label className="create-form-field">
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
                </label> */}

                {version.audioMode === 'shared' && (
                  <>
                    <div className="create-form-field">
                      <span>Audio (archivo) *</span>
                      <div className="create-file-upload-wrapper">
                        <input
                          id={`version-audio-${version.localId}`}
                          className="create-file-upload-input"
                          type="file"
                          accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            updateVersion(version.localId, { audioFile: file });
                          }}
                        />
                        <label htmlFor={`version-audio-${version.localId}`} className="create-file-upload-button">
                          {version.audioFile ? version.audioFile.name : 'Seleccionar archivo'}
                        </label>
                      </div>
                    </div>

                    <label className="create-form-field">
                      <span>o URL de Audio *</span>
                      <input
                        type="url"
                        value={version.audioReferenceUrl}
                        onChange={(e) => updateVersion(version.localId, { audioReferenceUrl: e.target.value })}
                        placeholder="https://ejemplo.com/audio.mp3"
                      />
                    </label>
                  </>
                )}

                {/* <label className="create-form-field">
                  <span>Letra (archivo opcional)</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateVersion(version.localId, { lyricsFile: file });
                    }}
                  />
                </label> */}

                {/* <label className="create-form-field">
                  <span>Partitura o Letra (archivo opcional)</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xml,.musicxml,.mxl,.doc,.docx,.mscz,.mscx,.txt,application/pdf,image/png,image/jpeg,application/xml,text/xml,text/plain,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/zip,application/x-zip-compressed,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateVersion(version.localId, { sheetFile: file });
                    }}
                  />
                  {version.sheetFile && (
                    <div className="create-file-preview">
                      <span className="create-file-info">
                        {version.sheetFile.name} ({(version.sheetFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <span className="create-file-type">
                        {version.sheetFile.type || 'Desconocido'}
                      </span>
                      {(version.sheetFile.type === 'image/png' || version.sheetFile.type === 'image/jpeg' || version.sheetFile.name.endsWith('.png') || version.sheetFile.name.endsWith('.jpg') || version.sheetFile.name.endsWith('.jpeg')) && (
                        <div className="create-image-preview">
                          <Image
                            src={URL.createObjectURL(version.sheetFile)}
                            alt="Previsualización de partitura"
                            width={200}
                            height={200}
                            onLoad={(e) => {
                              const target = e.target as HTMLImageElement;
                              URL.revokeObjectURL(target.src);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </label> */}
              </div>

              {/* Instrumentations section */}
              <div className="create-instrumentations-section">
                <div className="create-instrumentations-header">
                  <strong>Instrumentaciones</strong>
                  <button
                    type="button"
                    className="create-form-cancel"
                    onClick={() => addInstrumentation(version.localId)}
                    disabled={submitting}
                  >
                    + Agregar instrumentación
                  </button>
                </div>

                {version.instrumentations.map((inst, instIndex) => (
                  <article key={inst.localId} className="create-instrumentation-card">
                    <div className="create-instrumentation-card-header">
                      <div className="create-instrumentation-title">
                        <span className="create-instrumentation-number">{instIndex + 1}</span>
                        <strong>{inst.instrumentName || 'Instrumentación sin nombre'}</strong>
                      </div>
                      <button
                        type="button"
                        className="create-version-remove"
                        disabled={version.instrumentations.length === 1 || submitting}
                        onClick={() => removeInstrumentation(version.localId, inst.localId)}
                      >
                        Eliminar
                      </button>
                    </div>

                    <div className="create-instrumentation-body">
                      <div className="create-instrumentation-section">
                        <h4 className="create-instrumentation-section-title">Información básica</h4>
                        <div className="create-form-grid">
                          <label className="create-form-field">
                            <span>Instrumento *</span>
                            <input
                              type="text"
                              value={inst.instrumentName}
                              onChange={(e) => updateInstrumentation(version.localId, inst.localId, { instrumentName: e.target.value })}
                              placeholder="Ej: Guitarra, Piano, Letra"
                              required
                            />
                          </label>

                          <label className="create-form-field">
                            <span>Tono</span>
                            <input
                              type="text"
                              value={inst.tone}
                              onChange={(e) => updateInstrumentation(version.localId, inst.localId, { tone: e.target.value })}
                              placeholder="Ej: Do Mayor, Em"
                            />
                          </label>

                          <label className="create-form-field">
                            <span>Tipo de Notación</span>
                            <select
                              value={inst.notationType}
                              onChange={(e) => updateInstrumentation(version.localId, inst.localId, { notationType: e.target.value })}
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
                              <span>Audio (archivo) *</span>
                              <div className="create-file-upload-wrapper">
                                <input
                                  id={`inst-audio-${version.localId}-${inst.localId}`}
                                  className="create-file-upload-input"
                                  type="file"
                                  accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    updateInstrumentation(version.localId, inst.localId, { audioFile: file });
                                  }}
                                />
                                <label htmlFor={`inst-audio-${version.localId}-${inst.localId}`} className="create-file-upload-button">
                                  {inst.audioFile ? inst.audioFile.name : 'Seleccionar archivo'}
                                </label>
                              </div>
                            </div>

                            <label className="create-form-field">
                              <span>o URL de Audio *</span>
                              <input
                                type="url"
                                value={inst.audioReferenceUrl}
                                onChange={(e) => updateInstrumentation(version.localId, inst.localId, { audioReferenceUrl: e.target.value })}
                                placeholder="https://ejemplo.com/audio.mp3"
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="create-instrumentation-section">
                        <h4 className="create-instrumentation-section-title">Archivos y contenido</h4>
                        <p className="create-form-hint">
                          Al subir una partitura, la letra no está disponible para esta instrumentación. Solo puedes elegir uno: partitura <strong>o</strong> letra. Si necesitas la letra, crea una nueva instrumentación.
                        </p>
                        <div className="create-form-grid">
                          <div className="create-form-field">
                            <span>Partitura (archivo opcional)</span>
                            <div className="create-file-upload-wrapper">
                              <input
                                id={`inst-sheet-${version.localId}-${inst.localId}`}
                                className="create-file-upload-input"
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.xml,.musicxml,.mxl,.doc,.docx,.mscz,.mscx,.txt,application/pdf,image/png,image/jpeg,application/xml,text/xml,text/plain,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/zip,application/x-zip-compressed,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  updateInstrumentation(version.localId, inst.localId, { sheetFile: file });
                                }}
                              />
                              <label htmlFor={`inst-sheet-${version.localId}-${inst.localId}`} className="create-file-upload-button">
                                {inst.sheetFile ? inst.sheetFile.name : 'Seleccionar archivo'}
                              </label>
                              {inst.sheetFile && (
                                <button
                                  type="button"
                                  className="create-file-upload-cancel"
                                  onClick={() => {
                                    const input = document.getElementById(`inst-sheet-${version.localId}-${inst.localId}`) as HTMLInputElement | null;
                                    if (input) input.value = '';
                                    updateInstrumentation(version.localId, inst.localId, { sheetFile: null });
                                  }}
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {inst.sheetFile ? (
                          <p className="create-form-hint" style={{ fontWeight: '900'}}>
                            Al subir una partitura, la letra no está disponible para esta instrumentación. Solo puedes elegir uno: partitura <strong>o</strong> letra. Si necesitas la letra, crea una nueva instrumentación.
                          </p>
                        ) : (
                          <label className="create-form-field">
                            <span>Letra de esta instrumentación</span>
                            <textarea
                              value={inst.lyrics}
                              onChange={(e) => updateInstrumentation(version.localId, inst.localId, { lyrics: e.target.value })}
                              placeholder="Escribe o pega la letra para esta instrumentación…"
                              rows={6}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

               {/* <label className="create-form-field">
                <span>Letra de esta versión (legado)</span>
                <textarea
                  value={version.lyrics || ''}
                  onChange={(e) => updateVersion(version.localId, { lyrics: e.target.value })}
                  placeholder="Escribe o pega la letra de esta versión…"
                  rows={10}
                />
              </label> */}
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

        <p className="create-form-hint create-form-copyright">
          El artista/autor conserva todos los derechos de autor y el reconocimiento
          correspondiente sobre la canción. Canticum únicamente la aloja y la difunde
          respetando la autoría original.
        </p>
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

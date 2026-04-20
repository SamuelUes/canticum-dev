import type { SongDetail } from '../../types/song';

const baseLyrics = `Tu amor me sostiene\nCuando ya no puedo más\nTu voz me levanta\nY vuelve la paz\n\nTe canto en la mañana\nTe canto al anochecer\nCon todo lo que soy\nTe quiero agradecer\n\nSanto, santo, santo\nDigno de adorar\nSanto, santo, santo\nTu nombre exaltar`; 

function buildSongVersions(songId: string, audioReferenceUrl: string | undefined, versions: SongDetail['versions']): SongDetail['versions'] {
  return versions.map((version) => ({
    ...version,
    songId,
    versionId: version.id,
    versionName: version.versionName ?? version.label,
    isPremium: Boolean(version.isPremium),
    audioReferenceUrl: version.audioReferenceUrl ?? audioReferenceUrl
  }));
}

export const songMockById: Record<string, SongDetail> = {
  /**
   * Estado FREE — versiones premium bloqueadas, compra individual disponible
   */
  'song-alabare': {
    id: 'song-alabare',
    title: 'Alabaré Tu Nombre',
    artistName: 'Juan Pérez',
    lyrics: `${baseLyrics}\n\n${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura base disponible para vista previa.',
    audioUrl: '/assets/audio/reference/alabare.mp3',
    isFavorite: false,
    currentVersionId: 'version-juan-base',
    currentInstrumentId: 'instrument-guitarra',
    userAccess: {
      isAuthenticated: false,
      isPremiumUser: false,
      hasSongUnlock: false,
      canPurchaseIndividually: true,
      individualPriceUsd: 0.2
    },
    versions: buildSongVersions('song-alabare', '/assets/audio/reference/alabare.mp3', [
      { id: 'version-juan-base', artistName: 'Juan Pérez', label: 'Versión base', isPremium: false },
      { id: 'version-coro-live', artistName: 'Coro Emanuel', label: 'Versión en vivo', isPremium: true },
      { id: 'version-ana-acoustic', artistName: 'Ana Sofía', label: 'Versión acústica', isPremium: true },
      { id: 'version-orq-full', artistName: 'Orquesta Canticum', label: 'Versión orquestal', isPremium: true }
    ]),
    instruments: [
      { id: 'instrument-guitarra', name: 'Guitarra' },
      { id: 'instrument-bateria', name: 'Batería' },
      { id: 'instrument-ukelele', name: 'Ukelele' },
      { id: 'instrument-piano', name: 'Piano' }
    ]
  },
  /**
   * Estado PREMIUM — todas las versiones desbloqueadas vía plan premium
   */
  'song-santo-eres-tu': {
    id: 'song-santo-eres-tu',
    title: 'Santo Eres Tú',
    artistName: 'Coro Emanuel',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura coral completa.',
    audioUrl: '/assets/audio/reference/santo-eres-tu.mp3',
    isFavorite: true,
    currentVersionId: 'version-coro-base',
    currentInstrumentId: 'instrument-piano',
    userAccess: {
      isAuthenticated: true,
      isPremiumUser: true,
      hasSongUnlock: false,
      canPurchaseIndividually: false
    },
    versions: buildSongVersions('song-santo-eres-tu', '/assets/audio/reference/santo-eres-tu.mp3', [
      { id: 'version-coro-base', artistName: 'Coro Emanuel', label: 'Versión coral', isPremium: false },
      { id: 'version-grupo-fiat', artistName: 'Grupo Fiat', label: 'Versión congregacional', isPremium: true },
      { id: 'version-orq-plena', artistName: 'Orquesta Canticum', label: 'Versión orquestal plena', isPremium: true }
    ]),
    instruments: [
      { id: 'instrument-piano', name: 'Piano' },
      { id: 'instrument-guitarra', name: 'Guitarra' },
      { id: 'instrument-orquesta', name: 'Orquesta' }
    ]
  },
  /**
   * Estado UNLOCK INDIVIDUAL — desbloqueada por compra de canción individual
   */
  'song-renuevame': {
    id: 'song-renuevame',
    title: 'Renuévame Señor',
    artistName: 'María Luz',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura acústica disponible en vista previa.',
    audioUrl: '/assets/audio/reference/renuevame.mp3',
    isFavorite: false,
    currentVersionId: 'version-maria-base',
    currentInstrumentId: 'instrument-guitarra',
    userAccess: {
      isAuthenticated: true,
      isPremiumUser: false,
      hasSongUnlock: true,
      canPurchaseIndividually: true,
      individualPriceUsd: 0.2
    },
    versions: buildSongVersions('song-renuevame', '/assets/audio/reference/renuevame.mp3', [
      { id: 'version-maria-base', artistName: 'María Luz', label: 'Versión acústica', isPremium: false },
      { id: 'version-coro-worship', artistName: 'Coro Emanuel', label: 'Versión worship', isPremium: true },
      { id: 'version-piano-full', artistName: 'María Luz', label: 'Versión piano completa', isPremium: true }
    ]),
    instruments: [
      { id: 'instrument-guitarra', name: 'Guitarra' },
      { id: 'instrument-piano', name: 'Piano' },
      { id: 'instrument-ukelele', name: 'Ukelele' }
    ]
  },
  'song-aqui-estoy': {
    id: 'song-aqui-estoy',
    title: 'Aquí Estoy',
    artistName: 'Grupo Fiat',
    lyrics: `${baseLyrics}\n\n${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura de ensamble orquestal en actualización.',
    audioUrl: '/assets/audio/reference/aqui-estoy.mp3',
    isFavorite: true,
    currentVersionId: 'version-fiat-main',
    currentInstrumentId: 'instrument-orquesta',
    userAccess: {
      isAuthenticated: false,
      isPremiumUser: false,
      hasSongUnlock: false,
      canPurchaseIndividually: true,
      individualPriceUsd: 0.2
    },
    versions: buildSongVersions('song-aqui-estoy', '/assets/audio/reference/aqui-estoy.mp3', [
      { id: 'version-fiat-main', artistName: 'Grupo Fiat', label: 'Versión orquesta' },
      { id: 'version-juan-alive', artistName: 'Juan Pérez', label: 'Versión congregacional' }
    ]),
    instruments: [
      { id: 'instrument-orquesta', name: 'Orquesta' },
      { id: 'instrument-piano', name: 'Piano' },
      { id: 'instrument-bateria', name: 'Batería' }
    ]
  },
  'recent-1': {
    id: 'recent-1',
    title: 'Canto de Entrada',
    artistName: 'Juan Pérez',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura de entrada lista para descarga.',
    currentVersionId: 'version-entrada-base',
    currentInstrumentId: 'instrument-guitarra',
    versions: buildSongVersions('recent-1', undefined, [{ id: 'version-entrada-base', artistName: 'Juan Pérez', label: 'Versión litúrgica base' }]),
    instruments: [{ id: 'instrument-guitarra', name: 'Guitarra' }, { id: 'instrument-piano', name: 'Piano' }]
  },
  'recent-2': {
    id: 'recent-2',
    title: 'Gloria a Dios',
    artistName: 'María Luz',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura coral para ensayo semanal.',
    currentVersionId: 'version-gloria-coral',
    currentInstrumentId: 'instrument-piano',
    versions: buildSongVersions('recent-2', undefined, [{ id: 'version-gloria-coral', artistName: 'María Luz', label: 'Versión coral' }]),
    instruments: [{ id: 'instrument-piano', name: 'Piano' }, { id: 'instrument-guitarra', name: 'Guitarra' }]
  },
  'recent-3': {
    id: 'recent-3',
    title: 'Ofertorio de Paz',
    artistName: 'Coro Emanuel',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura en progreso para versión en vivo.',
    currentVersionId: 'version-ofertorio-base',
    currentInstrumentId: 'instrument-guitarra',
    versions: buildSongVersions('recent-3', undefined, [{ id: 'version-ofertorio-base', artistName: 'Coro Emanuel', label: 'Versión base' }]),
    instruments: [{ id: 'instrument-guitarra', name: 'Guitarra' }, { id: 'instrument-ukelele', name: 'Ukelele' }]
  },
  'recent-4': {
    id: 'recent-4',
    title: 'Santo, Santo',
    artistName: 'David Reyes',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura con acordes simplificados.',
    currentVersionId: 'version-santo-base',
    currentInstrumentId: 'instrument-piano',
    versions: buildSongVersions('recent-4', undefined, [{ id: 'version-santo-base', artistName: 'David Reyes', label: 'Versión base' }]),
    instruments: [{ id: 'instrument-piano', name: 'Piano' }, { id: 'instrument-bateria', name: 'Batería' }]
  },
  'recent-5': {
    id: 'recent-5',
    title: 'Cordero de Dios',
    artistName: 'Ana Sofía',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura vocal disponible para ministración.',
    currentVersionId: 'version-cordero-base',
    currentInstrumentId: 'instrument-guitarra',
    versions: buildSongVersions('recent-5', undefined, [{ id: 'version-cordero-base', artistName: 'Ana Sofía', label: 'Versión base' }]),
    instruments: [{ id: 'instrument-guitarra', name: 'Guitarra' }, { id: 'instrument-piano', name: 'Piano' }]
  },
  'recent-6': {
    id: 'recent-6',
    title: 'Envíanos Señor',
    artistName: 'Grupo Fiat',
    lyrics: `${baseLyrics}\n\n${baseLyrics}`,
    sheet: 'Partitura de cierre litúrgico.',
    currentVersionId: 'version-envianos-base',
    currentInstrumentId: 'instrument-guitarra',
    versions: buildSongVersions('recent-6', undefined, [{ id: 'version-envianos-base', artistName: 'Grupo Fiat', label: 'Versión base' }]),
    instruments: [{ id: 'instrument-guitarra', name: 'Guitarra' }, { id: 'instrument-orquesta', name: 'Orquesta' }]
  }
};

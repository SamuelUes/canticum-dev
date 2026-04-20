import type { AlbumDetail } from '../../types/album';

export const albumMockById: Record<string, AlbumDetail> = {
  'album-coro-emanuel-vive': {
    id: 'album-coro-emanuel-vive',
    title: 'Vive en Mí',
    description: 'Primer álbum del Coro Emanuel con repertorio litúrgico contemporáneo.',
    coverUrl: undefined,
    releaseYear: 2021,
    albumType: 'album',
    artistId: 'artist-coro-emanuel',
    artistName: 'Coro Emanuel',
    artistImageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 3,
    songs: [
      { id: 'song-santo-eres-tu', title: 'Santo Eres Tú', trackNumber: 1, tone: 'E', views: 573, hasLyrics: true, hasSheet: true, isPrimaryRelease: true, isVerified: true },
      { id: 'song-alabare', title: 'Alabaré Tu Nombre', trackNumber: 2, tone: 'F#m', views: 298, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'recent-3', title: 'Ofertorio de Paz', trackNumber: 3, tone: 'C', views: 231, hasLyrics: true, hasSheet: false, isPrimaryRelease: true }
    ]
  },
  'album-coro-emanuel-sendas': {
    id: 'album-coro-emanuel-sendas',
    title: 'Sendas Eternas',
    description: 'Segundo álbum del Coro Emanuel.',
    coverUrl: undefined,
    releaseYear: 2023,
    albumType: 'album',
    artistId: 'artist-coro-emanuel',
    artistName: 'Coro Emanuel',
    artistImageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 4,
    songs: [
      { id: 'recent-1', title: 'Canto de Entrada', trackNumber: 1, tone: 'G', views: 110, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'recent-4', title: 'Santo, Santo', trackNumber: 2, tone: 'D', views: 99, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'song-renuevame', title: 'Renuévame Señor', trackNumber: 3, tone: 'C', views: 78, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'recent-2', title: 'Gloria a Dios', trackNumber: 4, tone: 'E', views: 59, hasLyrics: true, hasSheet: false, isPrimaryRelease: true }
    ]
  },
  'album-coro-emanuel-luz': {
    id: 'album-coro-emanuel-luz',
    title: 'Luz del Mundo',
    description: 'EP especial de Adviento.',
    coverUrl: undefined,
    releaseYear: 2022,
    albumType: 'ep',
    artistId: 'artist-coro-emanuel',
    artistName: 'Coro Emanuel',
    artistImageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 2,
    songs: [
      { id: 'recent-5', title: 'Cordero de Dios', trackNumber: 1, tone: 'A#', views: 18, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'song-aqui-estoy', title: 'Aquí Estoy', trackNumber: 2, tone: 'C', views: 7, hasLyrics: true, hasSheet: false, isPrimaryRelease: false }
    ]
  },
  'album-grupo-fiat-presencia': {
    id: 'album-grupo-fiat-presencia',
    title: 'En Tu Presencia',
    description: 'Álbum debut del Grupo Fiat.',
    coverUrl: undefined,
    releaseYear: 2020,
    albumType: 'album',
    artistId: 'artist-grupo-fiat',
    artistName: 'Grupo Fiat',
    artistImageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 3,
    songs: [
      { id: 'song-aqui-estoy', title: 'Aquí Estoy', trackNumber: 1, tone: 'Ab', views: 381, hasLyrics: true, hasSheet: true, isPrimaryRelease: true, isVerified: true },
      { id: 'song-renuevame', title: 'Renuévame Señor', trackNumber: 2, tone: 'G', views: 230, hasLyrics: true, hasSheet: true, isPrimaryRelease: true },
      { id: 'song-santo-eres-tu', title: 'Santo Eres Tú', trackNumber: 3, tone: 'F#', views: 98, hasLyrics: true, hasSheet: false, isPrimaryRelease: false }
    ]
  },
  'album-juan-perez-camino': {
    id: 'album-juan-perez-camino',
    title: 'Camino a Ti',
    description: 'Repertorio congregacional de Juan Pérez.',
    coverUrl: undefined,
    releaseYear: 2019,
    albumType: 'album',
    artistId: 'artist-juan-perez',
    artistName: 'Juan Pérez',
    artistImageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 2,
    songs: [
      { id: 'song-alabare', title: 'Alabaré Tu Nombre', trackNumber: 1, tone: 'F#m', views: 298, hasLyrics: true, hasSheet: true, isPrimaryRelease: true, isVerified: true },
      { id: 'recent-1', title: 'Canto de Entrada', trackNumber: 2, tone: 'G', views: 110, hasLyrics: true, hasSheet: true, isPrimaryRelease: true }
    ]
  }
};

export const albumsByArtistMock: Record<string, string[]> = {
  'artist-coro-emanuel': ['album-coro-emanuel-vive', 'album-coro-emanuel-sendas', 'album-coro-emanuel-luz'],
  'artist-grupo-fiat': ['album-grupo-fiat-presencia'],
  'artist-juan-perez': ['album-juan-perez-camino']
};

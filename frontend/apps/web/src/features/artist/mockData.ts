import type { ArtistDetail, ArtistDiscographyItem, ArtistrepertoireRef, SuggestedArtistItem } from '../../types/artist';

type ArtistDetailBase = Omit<
  ArtistDetail,
  'type' | 'images' | 'followers' | 'popularity' | 'likeCount' | 'totalViews' | 'genres' | 'discography' | 'suggestedArtists'
>;

function computePopularity(totalViews: number): number {
  if (!Number.isFinite(totalViews) || totalViews <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.log10(totalViews + 1) * 20)));
}

const artistMockBaseById: Record<string, ArtistDetailBase> = {
  'artist-coro-emanuel': {
    id: 'artist-coro-emanuel',
    name: 'Coro Emanuel',
    bio: 'Ministerio coral con enfoque litúrgico y arreglos para coro mixto.',
    ministryType: 'Ministerio Coral',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 34,
    highlightedSongs: ['Santo Eres Tú', 'Alabaré Tu Nombre'],
    songs: [
      { id: 'song-santo-eres-tu', title: 'Santo Eres Tú', views: 573, tone: 'E', hasLyrics: true, hasSheet: true, isVerified: true },
      { id: 'song-alabare', title: 'Alabaré Tu Nombre', views: 298, tone: 'F#m', hasLyrics: true, hasSheet: true },
      { id: 'recent-3', title: 'Ofertorio de Paz', views: 231, tone: 'C', hasLyrics: true, hasSheet: false },
      { id: 'recent-1', title: 'Canto de Entrada', views: 110, tone: 'G', hasLyrics: true, hasSheet: true },
      { id: 'recent-4', title: 'Santo, Santo', views: 99, tone: 'D', hasLyrics: true, hasSheet: true },
      { id: 'song-renuevame', title: 'Renuévame Señor', views: 78, tone: 'C', hasLyrics: true, hasSheet: true },
      { id: 'recent-2', title: 'Gloria a Dios', views: 59, tone: 'E', hasLyrics: true, hasSheet: false },
      { id: 'recent-5', title: 'Cordero de Dios', views: 18, tone: 'A#', hasLyrics: true, hasSheet: true },
      { id: 'recent-6', title: 'Envíanos Señor', views: 12, tone: 'G', hasLyrics: false, hasSheet: false },
      { id: 'song-aqui-estoy', title: 'Aquí Estoy', views: 7, tone: 'C', hasLyrics: true, hasSheet: false }
    ]
  },
  'artist-grupo-fiat': {
    id: 'artist-grupo-fiat',
    name: 'Grupo Fiat',
    bio: 'Ensamble parroquial para eventos y celebraciones especiales.',
    ministryType: 'Ensamble',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 27,
    highlightedSongs: ['Aquí Estoy', 'Renuévame Señor'],
    songs: [
      { id: 'song-aqui-estoy', title: 'Aquí Estoy', views: 381, tone: 'Ab', hasLyrics: true, hasSheet: true, isVerified: true },
      { id: 'song-renuevame', title: 'Renuévame Señor', views: 230, tone: 'G', hasLyrics: true, hasSheet: true },
      { id: 'song-santo-eres-tu', title: 'Santo Eres Tú', views: 98, tone: 'F#', hasLyrics: true, hasSheet: false },
      { id: 'recent-6', title: 'Envíanos Señor', views: 17, tone: 'Am', hasLyrics: true, hasSheet: true },
      { id: 'recent-4', title: 'Santo, Santo', views: 4, tone: 'D', hasLyrics: true, hasSheet: false }
    ]
  },
  'artist-juan-perez': {
    id: 'artist-juan-perez',
    name: 'Juan Pérez',
    bio: 'Cantautor y líder de alabanza con repertorio congregacional.',
    ministryType: 'Cantautor',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 12,
    highlightedSongs: ['Alabaré Tu Nombre', 'Canto de Entrada'],
    songs: [
      { id: 'song-alabare', title: 'Alabaré Tu Nombre', views: 298, tone: 'F#m', hasLyrics: true, hasSheet: true, isVerified: true },
      { id: 'recent-1', title: 'Canto de Entrada', views: 110, tone: 'G', hasLyrics: true, hasSheet: true },
      { id: 'song-aqui-estoy', title: 'Aquí Estoy', views: 98, tone: 'F#', hasLyrics: true, hasSheet: false }
    ]
  },
  'artist-maria-luz': {
    id: 'artist-maria-luz',
    name: 'María Luz',
    bio: 'Voz principal enfocada en ministerios parroquiales y acústicos.',
    ministryType: 'Vocalista',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 9,
    highlightedSongs: ['Renuévame Señor', 'Gloria a Dios'],
    songs: [
      { id: 'song-renuevame', title: 'Renuévame Señor', views: 230, tone: 'G', hasLyrics: true, hasSheet: true, isVerified: true },
      { id: 'recent-2', title: 'Gloria a Dios', views: 59, tone: 'E', hasLyrics: true, hasSheet: false }
    ]
  },
  'artist-david-reyes': {
    id: 'artist-david-reyes',
    name: 'David Reyes',
    bio: 'Director musical especializado en arreglos para coro y ensamble.',
    ministryType: 'Director musical',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 6,
    highlightedSongs: ['Santo, Santo'],
    songs: [{ id: 'recent-4', title: 'Santo, Santo', views: 99, tone: 'D', hasLyrics: true, hasSheet: true }]
  },
  'artist-ana-sofia': {
    id: 'artist-ana-sofia',
    name: 'Ana Sofía',
    bio: 'Compositora de repertorio litúrgico contemporáneo.',
    ministryType: 'Compositora',
    imageUrl: '/assets/utils/iconly_light-outline_profile/iconlylightoutlineprofile2x.png',
    songsCount: 5,
    highlightedSongs: ['Cordero de Dios'],
    songs: [{ id: 'recent-5', title: 'Cordero de Dios', views: 18, tone: 'A#', hasLyrics: true, hasSheet: true }]
  }
};

const artistDiscographyMap: Record<string, ArtistDiscographyItem[]> = {
  'artist-coro-emanuel': [
    { id: 'album-coro-emanuel-sendas', title: 'Sendas Eternas', year: 2023, albumId: 'album-coro-emanuel-sendas' },
    { id: 'album-coro-emanuel-luz', title: 'Luz del Mundo', year: 2022, albumId: 'album-coro-emanuel-luz' },
    { id: 'album-coro-emanuel-vive', title: 'Vive en Mí', year: 2021, albumId: 'album-coro-emanuel-vive' }
  ],
  'artist-grupo-fiat': [
    { id: 'album-grupo-fiat-presencia', title: 'En Tu Presencia', year: 2020, albumId: 'album-grupo-fiat-presencia' }
  ],
  'artist-juan-perez': [
    { id: 'album-juan-perez-camino', title: 'Camino a Ti', year: 2019, albumId: 'album-juan-perez-camino' }
  ]
};

function buildFallbackDiscography(artist: ArtistDetailBase): ArtistDiscographyItem[] {
  if (artistDiscographyMap[artist.id]) {
    return artistDiscographyMap[artist.id];
  }
  const currentYear = new Date().getFullYear();
  return artist.songs.slice(0, 5).map((song, index) => ({
    id: `discography-${artist.id}-${song.id}`,
    title: song.title,
    year: currentYear - (index + 2),
    coverUrl: song.thumbnailUrl,
    songId: song.id
  }));
}

function buildFallbackSuggestedArtists(artist: ArtistDetailBase): SuggestedArtistItem[] {
  const names = ['Soda Stereo', 'Los Auténticos Decadentes', 'Gustavo Cerati', 'Babasónicos', 'Los Prisioneros'];

  return names
    .filter((name) => name.toLowerCase() !== artist.name.toLowerCase())
    .slice(0, 5)
    .map((name) => ({
      id: `suggested-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name
    }));
}

export const artistMockById: Record<string, ArtistDetail> = Object.fromEntries(
  Object.entries(artistMockBaseById).map(([artistId, artist]) => {
    const totalViews = artist.songs.reduce((acc, song) => acc + song.views, 0);
    const likeCount = Math.max(Math.floor(totalViews * 0.34), 200);
    const genres = [artist.ministryType || 'General'];
    const images = artist.imageUrl ? [{ url: artist.imageUrl, width: 640, height: 640 }] : [];

    const detail: ArtistDetail = {
      ...artist,
      type: 'artist',
      images,
      likeCount,
      followers: { total: likeCount },
      totalViews,
      popularity: computePopularity(totalViews),
      genres,
      discography: buildFallbackDiscography(artist),
      suggestedArtists: buildFallbackSuggestedArtists(artist)
    };

    return [artistId, detail];
  })
) as Record<string, ArtistDetail>;

export const artistrepertoiresMock: ArtistrepertoireRef[] = [
  { id: 'repertoire-misa-pentecoste', title: 'Misa de Pentecostés', ownerName: 'Coro Emanuel', songIds: ['song-alabare', 'song-santo-eres-tu', 'song-renuevame'] },
  { id: 'repertoire-concierto-jovenes', title: 'Concierto Juvenil', ownerName: 'Grupo Fiat', songIds: ['song-aqui-estoy', 'song-santo-eres-tu', 'song-alabare'] },
  { id: 'repertoire-misa-confirmacion', title: 'Misa de Confirmación', ownerName: 'María Luz', songIds: ['song-santo-eres-tu', 'song-aqui-estoy', 'song-renuevame'] }
];

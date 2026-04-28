import type {
  SearchAlbumItem,
  SearchArtistItem,
  SearchBucket,
  SearchBuckets,
  SearchDataset,
  SearchEntityItem,
  SearchrepertoireItem,
  SearchSongItem,
  SearchVersionItem
} from '../../types/search';

const items: SearchEntityItem[] = [
  {
    id: 'song-alabare-tu-nombre',
    kind: 'song',
    type: 'song',
    songId: 'song-alabare',
    title: 'Alabaré Tu Nombre',
    subtitle: 'Canción · Juan Pérez',
    liturgicalType: 'Himno',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Coro Emanuel',
    searchableText: 'alabare tu nombre cancion juan perez coro emmanuel himno ordinario',
    isPremium: false
  },
  {
    id: 'song-santo-eres-tu',
    kind: 'song',
    type: 'song',
    songId: 'song-santo-eres-tu',
    title: 'Santo Eres Tú',
    subtitle: 'Canción · Coro Emanuel',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Pascua',
    authorOrChoir: 'Coro Emanuel',
    searchableText: 'santo eres tu cancion coro emmanuel liturgico pascua',
    isPremium: true
  },
  {
    id: 'album-coro-emanuel-sendas',
    kind: 'album',
    type: 'album',
    albumId: 'album-coro-emanuel-sendas',
    artistId: 'artist-coro-emanuel',
    title: 'Sendas Eternas',
    subtitle: 'Álbum · Coro Emanuel',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Coro Emanuel',
    searchableText: 'album sendas eternas coro emmanuel liturgico',
    albumType: 'album',
    releaseYear: 2023,
    totalTracks: 10,
    artistName: 'Coro Emanuel'
  },
  {
    id: 'album-grupo-fiat-presencia',
    kind: 'album',
    type: 'album',
    albumId: 'album-grupo-fiat-presencia',
    artistId: 'artist-grupo-fiat',
    title: 'En Tu Presencia',
    subtitle: 'EP · Grupo Fiat',
    liturgicalType: 'Evento',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Grupo Fiat',
    searchableText: 'album en tu presencia grupo fiat ep evento',
    albumType: 'ep',
    releaseYear: 2020,
    totalTracks: 6,
    artistName: 'Grupo Fiat'
  },
  {
    id: 'repertoire-misa-pentecoste',
    kind: 'repertoire',
    type: 'repertoire',
    repertoireId: 'repertoire-misa-pentecoste',
    title: 'Misa de Pentecostés',
    subtitle: 'Estructura principal',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Pentecostés',
    authorOrChoir: 'Coro Emanuel',
    searchableText: 'misa pentecostes repertorio estructura coro emmanuel liturgico',
    dateLabel: '12/Mayo/2026',
    songsCount: 8,
    sheetsCount: 4,
    ownerUserId: 'user-1',
    isPublic: true,
    isTrending: true
  },
  {
    id: 'repertoire-concierto-jovenes',
    kind: 'repertoire',
    type: 'repertoire',
    repertoireId: 'repertoire-concierto-jovenes',
    title: 'Concierto Juvenil',
    subtitle: 'Setlist de actividad',
    liturgicalType: 'Evento',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Grupo Fiat',
    searchableText: 'concierto juvenil repertorio setlist actividad grupo fiat evento ordinario',
    dateLabel: '08/Mayo/2026',
    songsCount: 10,
    sheetsCount: 6,
    ownerUserId: 'user-2',
    isPublic: true,
    isTrending: true
  },
  {
    id: 'repertoire-boda-alianza',
    kind: 'repertoire',
    type: 'repertoire',
    repertoireId: 'repertoire-boda-alianza',
    title: 'Boda',
    subtitle: 'Misa solemne',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'María Luz',
    searchableText: 'boda repertorio misa solemne maria luz liturgico ordinario',
    dateLabel: '28/Abr/2026',
    songsCount: 8,
    sheetsCount: 4,
    ownerUserId: 'user-1',
    isPublic: false
  },
  {
    id: 'repertoire-orquesta-vigilia',
    kind: 'repertoire',
    type: 'repertoire',
    repertoireId: 'repertoire-orquesta-vigilia',
    title: 'Orquesta',
    subtitle: 'Ensayo general',
    liturgicalType: 'Evento',
    liturgicalTime: 'Adviento',
    authorOrChoir: 'Grupo Fiat',
    searchableText: 'orquesta repertorio ensayo vigilia grupo fiat evento adviento',
    dateLabel: '20/Abr/2026',
    songsCount: 7,
    sheetsCount: 7,
    ownerUserId: 'user-2',
    isPublic: false
  },
  {
    id: 'artist-coro-emanuel',
    kind: 'artist',
    type: 'artist',
    artistId: 'artist-coro-emanuel',
    title: 'Coro Emanuel',
    subtitle: 'Ministerio coral',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Coro Emanuel',
    searchableText: 'artista coro emmanuel ministerio coral liturgico',
    songsCount: 34
  },
  {
    id: 'artist-grupo-fiat',
    kind: 'artist',
    type: 'artist',
    artistId: 'artist-grupo-fiat',
    title: 'Grupo Fiat',
    subtitle: 'Ensamble parroquial',
    liturgicalType: 'Evento',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Grupo Fiat',
    searchableText: 'artista grupo fiat ensamble parroquial evento',
    songsCount: 27
  },
  {
    id: 'version-alabare-piano',
    kind: 'version',
    type: 'version',
    songId: 'song-alabare',
    title: 'Alabaré Tu Nombre · Piano',
    subtitle: 'Versión por Ana Sofía',
    liturgicalType: 'Himno',
    liturgicalTime: 'Ordinario',
    authorOrChoir: 'Ana Sofía',
    searchableText: 'version alabare piano ana sofia himno ordinario cifrado',
    instrument: 'Piano',
    notationType: 'Cifrado',
    isPremium: true
  },
  {
    id: 'version-santo-orquesta',
    kind: 'version',
    type: 'version',
    songId: 'song-santo-eres-tu',
    title: 'Santo Eres Tú · Orquesta',
    subtitle: 'Versión por Grupo Fiat',
    liturgicalType: 'Litúrgico',
    liturgicalTime: 'Pascua',
    authorOrChoir: 'Grupo Fiat',
    searchableText: 'version santo orquesta grupo fiat liturgico pascua pentagrama',
    instrument: 'Orquesta',
    notationType: 'Pentagrama',
    isPremium: true
  }
];

function buildBucket<T extends SearchEntityItem>(list: T[]): SearchBucket<T> {
  return {
    href: null,
    limit: list.length,
    offset: 0,
    total: list.length,
    next: null,
    previous: null,
    items: list
  };
}

const buckets: SearchBuckets = {
  songs: buildBucket(items.filter((item): item is SearchSongItem => item.kind === 'song')),
  albums: buildBucket(items.filter((item): item is SearchAlbumItem => item.kind === 'album')),
  repertoires: buildBucket(items.filter((item): item is SearchrepertoireItem => item.kind === 'repertoire')),
  artists: buildBucket(items.filter((item): item is SearchArtistItem => item.kind === 'artist')),
  versions: buildBucket(items.filter((item): item is SearchVersionItem => item.kind === 'version'))
};

export const searchMockData: SearchDataset = {
  filters: {
    liturgicalTypes: ['Himno', 'Litúrgico', 'Evento'],
    liturgicalTimes: ['Ordinario', 'Adviento', 'Pascua', 'Pentecostés'],
    authorOrChoirs: ['Coro Emanuel', 'Grupo Fiat', 'María Luz', 'Ana Sofía']
  },
  items,
  buckets
};

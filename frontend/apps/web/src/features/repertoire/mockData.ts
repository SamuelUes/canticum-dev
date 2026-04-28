import type { repertoireDetail, repertoireListItem } from '../../types/repertoire';

export const repertoireMockById: Record<string, repertoireDetail> = {
  'repertoire-misa-pentecoste': {
    id: 'repertoire-misa-pentecoste',
    title: 'Misa de Pentecostés',
    createdAt: '12/Mayo/2026',
    createdBy: 'Coro Emanuel',
    ownerUserId: 'user-1',
    isPublic: true,
    status: 'Publicado',
    liturgicalType: 'Litúrgico',
    songsCount: 8,
    sheetsCount: 4,
    songIds: ['song-alabare', 'song-santo-eres-tu', 'song-renuevame'],
    description: 'Estructura principal para misa solemne con repertorio de Pentecostés.'
  },
  'repertoire-concierto-jovenes': {
    id: 'repertoire-concierto-jovenes',
    title: 'Concierto Juvenil',
    createdAt: '08/Mayo/2026',
    createdBy: 'Grupo Fiat',
    ownerUserId: 'user-2',
    isPublic: true,
    status: 'Publicado',
    liturgicalType: 'Evento',
    songsCount: 10,
    sheetsCount: 6,
    songIds: ['song-aqui-estoy', 'song-santo-eres-tu', 'song-alabare'],
    description: 'Setlist para evento juvenil con transición de momentos de alabanza.'
  },
  'repertoire-boda-alianza': {
    id: 'repertoire-boda-alianza',
    title: 'Boda',
    createdAt: '28/Abr/2026',
    createdBy: 'María Luz',
    ownerUserId: 'user-1',
    isPublic: false,
    status: 'Borrador',
    liturgicalType: 'Litúrgico',
    songsCount: 8,
    sheetsCount: 4,
    songIds: ['song-renuevame', 'song-alabare'],
    description: 'repertorio para ceremonia de boda con momentos litúrgicos estándar.'
  },
  'repertoire-orquesta-vigilia': {
    id: 'repertoire-orquesta-vigilia',
    title: 'Orquesta',
    createdAt: '20/Abr/2026',
    createdBy: 'Grupo Fiat',
    ownerUserId: 'user-2',
    isPublic: false,
    status: 'Borrador',
    liturgicalType: 'Evento',
    songsCount: 7,
    sheetsCount: 7,
    songIds: ['song-aqui-estoy', 'song-santo-eres-tu'],
    description: 'Formato de ensayo general orquestal para vigilia.'
  }
};

export const repertoireListMock: repertoireListItem[] = [
  {
    id: 'repertoire-boda-alianza',
    title: 'Boda Sofía & Pedro',
    subtitle: 'Liturgia de la Palabra',
    dateLabel: '15/10/2023',
    liturgicalType: 'Boda',
    status: 'Borrador',
    songsCount: 5,
    sheetsCount: 3,
    coverImageUrl: '',
    songIds: ['song-alabare', 'song-renuevame', 'song-santo-eres-tu'],
    ownerUserId: 'user-1',
    isPublic: false
  },
  {
    id: 'repertoire-misa-pentecoste',
    title: 'Misa Dominical',
    subtitle: 'Eucaristía de Adviento',
    dateLabel: '22/10/2023',
    liturgicalType: 'Misa',
    status: 'Publicado',
    songsCount: 3,
    sheetsCount: 3,
    coverImageUrl: '',
    songIds: ['song-alabare', 'song-santo-eres-tu', 'song-aqui-estoy'],
    ownerUserId: 'user-1',
    isPublic: true
  },
  {
    id: 'repertoire-servicio-funeral',
    title: 'Servicio de Funeral',
    subtitle: 'Memorial',
    dateLabel: '05/11/2023',
    liturgicalType: 'Funeral',
    status: 'Borrador',
    songsCount: 5,
    sheetsCount: 3,
    songIds: ['song-renuevame', 'song-aqui-estoy'],
    ownerUserId: 'user-1',
    isPublic: false
  },
  {
    id: 'repertoire-misa-confirmacion',
    title: 'Misa de Confirmación',
    subtitle: 'Eucaristía de Pentecostés',
    dateLabel: '12/11/2023',
    liturgicalType: 'Misa',
    status: 'Publicado',
    songsCount: 3,
    sheetsCount: 3,
    coverImageUrl: '',
    songIds: ['song-santo-eres-tu', 'song-aqui-estoy', 'song-renuevame'],
    ownerUserId: 'user-1',
    isPublic: true
  }
];

export type SchemaStatus = 'Borrador' | 'Publicado';

export interface SongRef {
  id: string;
  title: string;
  artistName?: string;
  audioUrl?: string;
}

export interface SchemaDetail {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  ownerUserId: string;
  isPublic: boolean;
  status: SchemaStatus;
  liturgicalType: string;
  songsCount: number;
  sheetsCount: number;
  songIds: string[];
  description: string;
  songs?: SongRef[];
}

export interface SchemaListItem {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  liturgicalType: string;
  status: SchemaStatus;
  songsCount: number;
  sheetsCount: number;
  coverImageUrl?: string;
  songIds?: string[];
  ownerUserId: string;
  isPublic: boolean;
}

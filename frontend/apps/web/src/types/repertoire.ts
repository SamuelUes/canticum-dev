export type repertoireStatus = 'Borrador' | 'Publicado';

export interface SongRef {
  id: string;
  title: string;
  artistName?: string;
  audioUrl?: string;
  versionId?: string;
  versionName?: string;
  instrumentName?: string;
  matchType?: 'song' | 'version';
}

export interface RepertoireSongSearchOption {
  songId: string;
  versionId: string | null;
  title: string;
  artistName: string | null;
  songArtistName: string | null;
  versionArtistName: string | null;
  versionName: string | null;
  instrumentName: string | null;
  matchType: 'song' | 'version';
}

export interface RepertoireSelectedSong {
  songId: string;
  versionId?: string;
}

export interface repertoireDetail {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  ownerUserId: string;
  isPublic: boolean;
  status: repertoireStatus;
  liturgicalType: string;
  songsCount: number;
  sheetsCount: number;
  songIds: string[];
  selectedSongs?: RepertoireSelectedSong[];
  description: string;
  songs?: SongRef[];
}

export interface repertoireListItem {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  liturgicalType: string;
  status: repertoireStatus;
  songsCount: number;
  sheetsCount: number;
  coverImageUrl?: string;
  songIds?: string[];
  ownerUserId: string;
  isPublic: boolean;
}

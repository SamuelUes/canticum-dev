/**
 * Search kind discriminator. Aligned with Spotify search types:
 * Spotify `track` -> Canticum `song`
 * Spotify `album` -> `album`
 * Spotify `playlist` -> `repertoire` (Canticum's equivalent of a curated playlist)
 * Plus Canticum-specific `artist` and `version` kinds.
 */
export type SearchEntityKind = 'song' | 'album' | 'repertoire' | 'artist' | 'version';

export interface SearchImage {
  url: string;
  width?: number;
  height?: number;
}

export interface SearchFilterOptions {
  liturgicalTypes: string[];
  liturgicalTimes: string[];
  authorOrChoirs: string[];
}

export interface SearchEntityBase {
  id: string;
  /** Canticum-specific discriminator (kept for backwards compatibility). */
  kind: SearchEntityKind;
  /** Spotify-aligned type discriminator. Mirrors `kind` one-to-one. */
  type: SearchEntityKind;
  title: string;
  subtitle: string;
  songId?: string;
  repertoireId?: string;
  artistId?: string;
  albumId?: string;
  /** Optional Spotify-style image list (largest first). */
  images?: SearchImage[];
  liturgicalType: string;
  liturgicalTime: string;
  authorOrChoir: string;
  searchableText: string;
}

export interface SearchSongItem extends SearchEntityBase {
  kind: 'song';
  type: 'song';
  isPremium: boolean;
  popularity?: number;
  totalViews?: number;
  likeCount?: number;
  publishedAt?: string | null;
  createdAt?: string | null;
  ownerUserId?: string;
}

export interface SearchAlbumItem extends SearchEntityBase {
  kind: 'album';
  type: 'album';
  albumId: string;
  /** 'album' | 'single' | 'ep' | 'compilation' | 'live' */
  albumType: string;
  releaseYear?: number;
  totalTracks: number;
  artistName: string;
}

export interface SearchrepertoireItem extends SearchEntityBase {
  kind: 'repertoire';
  type: 'repertoire';
  dateLabel: string;
  songsCount: number;
  sheetsCount: number;
  ownerUserId: string;
  isPublic: boolean;
  isTrending?: boolean;
}

export interface SearchArtistItem extends SearchEntityBase {
  kind: 'artist';
  type: 'artist';
  songsCount: number;
}

export interface SearchVersionItem extends SearchEntityBase {
  kind: 'version';
  type: 'version';
  instrument: string;
  notationType: string;
  isPremium: boolean;
}

export type SearchEntityItem =
  | SearchSongItem
  | SearchAlbumItem
  | SearchrepertoireItem
  | SearchArtistItem
  | SearchVersionItem;

/**
 * Paged bucket envelope, Spotify-aligned:
 * `{ href, limit, offset, total, next, previous, items[] }`.
 */
export interface SearchBucket<T> {
  href: string | null;
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
  items: T[];
}

export interface SearchBuckets {
  songs?: SearchBucket<SearchSongItem>;
  albums?: SearchBucket<SearchAlbumItem>;
  repertoires?: SearchBucket<SearchrepertoireItem>;
  artists?: SearchBucket<SearchArtistItem>;
  versions?: SearchBucket<SearchVersionItem>;
}

export interface SearchDataset {
  filters: SearchFilterOptions;
  items: SearchEntityItem[];
  /** Optional paged buckets (populated when the backend returns Spotify-style envelopes). */
  buckets?: SearchBuckets;
}

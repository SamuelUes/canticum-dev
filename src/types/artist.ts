export interface ArtistSongRow {
  id: string;
  title: string;
  thumbnailUrl?: string;
  views: number;
  tone: string;
  hasLyrics: boolean;
  hasSheet: boolean;
  isVerified?: boolean;
}

export interface ArtistSchemaRef {
  id: string;
  title: string;
  ownerName: string;
  songIds: string[];
}

export interface ArtistDiscographyItem {
  id: string;
  title: string;
  year: number;
  coverUrl?: string;
  songId?: string;
  albumId?: string;
}

export interface SuggestedArtistItem {
  id: string;
  name: string;
  imageUrl?: string;
  images?: ArtistImage[];
}

export interface ArtistImage {
  url: string;
  width?: number;
  height?: number;
}

export interface ArtistFollowers {
  total: number;
}

export interface ArtistDetail {
  /** Constant discriminator — Spotify-compatible */
  type: 'artist';
  id: string;
  name: string;
  bio: string;
  ministryType: string;
  /** Preferred: list of images with width/height. Ordered from largest to smallest. */
  images: ArtistImage[];
  /** Back-compat: single URL (first entry of `images`). */
  imageUrl?: string;
  songsCount: number;
  /** Back-compat alias of `followers.total`. */
  likeCount: number;
  /** Spotify-aligned followers object. */
  followers: ArtistFollowers;
  totalViews: number;
  /** Normalized 0–100 popularity derived from totalViews. */
  popularity: number;
  genres: string[];
  discography: ArtistDiscographyItem[];
  suggestedArtists: SuggestedArtistItem[];
  highlightedSongs: string[];
  songs: ArtistSongRow[];
}

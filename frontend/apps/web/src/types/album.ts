export type AlbumType = 'album' | 'single' | 'ep' | 'compilation' | 'live' | 'concert';

/** Spotify-aligned image descriptor (largest first when in a list). */
export interface AlbumImage {
  url: string;
  width?: number;
  height?: number;
}

/** External identifiers block. Spotify-aligned; Canticum uses `upc` for albums. */
export interface AlbumExternalIds {
  upc?: string;
}

/** External URLs block (per-provider). */
export interface AlbumExternalUrls {
  canticum?: string;
  spotify?: string;
}

/** Simplified artist reference used inside `AlbumDetail.artists[]`. */
export interface AlbumSimplifiedArtist {
  id: string;
  name: string;
  type: 'artist';
  href?: string;
  imageUrl?: string;
  externalUrls?: AlbumExternalUrls;
}

/** Spotify-style copyright entry. */
export interface AlbumCopyright {
  /** Free-text notice, e.g. '(P) 2012 RCA Records'. */
  text: string;
  /** 'C' (composition) | 'P' (performance/sound recording). */
  type: 'C' | 'P';
}

export interface AlbumSongRow {
  id: string;
  /** Spotify-aligned discriminator. */
  type?: 'song';
  title: string;
  /** Spotify-aligned mirror of `title`. */
  name?: string;
  thumbnailUrl?: string;
  trackNumber?: number;
  /** 1-based disc number (defaults to 1). */
  discNumber?: number;
  /** Track duration in milliseconds. */
  durationMs?: number;
  /** Simplified artists participating on this track. */
  artists?: AlbumSimplifiedArtist[];
  externalUrls?: AlbumExternalUrls;
  tone: string;
  views: number;
  hasLyrics: boolean;
  hasSheet: boolean;
  isPrimaryRelease: boolean;
  isVerified?: boolean;
  status?: string;
}

/** Paged tracks bucket, Spotify-aligned (`{ href, limit, offset, total, next, previous, items }`). */
export interface AlbumTracksBucket {
  href: string;
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
  items: AlbumSongRow[];
}

export interface AlbumDetail {
  id: string;
  /** Spotify-aligned discriminator. Always `'album'`. */
  type?: 'album';
  /** Canonical title. */
  title: string;
  /** Spotify-aligned mirror of `title`. */
  name?: string;
  description?: string;
  /** Back-compat single cover URL; mirrors `images[0].url`. */
  coverUrl?: string;
  /** Ordered image variants (largest first). Spotify-aligned. */
  images?: AlbumImage[];
  /** Canticum legacy release year (back-compat). */
  releaseYear: number;
  /** Spotify-aligned ISO release date (e.g. '2012-11-16'). */
  releaseDate?: string;
  /** 'year' | 'month' | 'day' */
  releaseDatePrecision?: 'year' | 'month' | 'day';
  albumType: AlbumType;
  /** Back-compat primary artist id. */
  artistId: string;
  /** Back-compat primary artist name. */
  artistName: string;
  /** Back-compat primary artist image. */
  artistImageUrl?: string;
  /** Spotify-aligned list of participating artists (first is primary). */
  artists?: AlbumSimplifiedArtist[];
  /** Legacy count; mirrors `totalTracks`. */
  songsCount: number;
  /** Spotify-aligned alias of `songsCount`. */
  totalTracks?: number;
  /** Spotify-aligned paged tracks bucket. */
  tracks?: AlbumTracksBucket;
  /** Back-compat flat song list (mirror of `tracks.items`). */
  songs: AlbumSongRow[];
  /** Array of song IDs in the album. */
  songIds?: string[];
  /** Spotify-aligned metadata. */
  label?: string;
  genres?: string[];
  copyrights?: AlbumCopyright[];
  externalIds?: AlbumExternalIds;
  externalUrls?: AlbumExternalUrls;
  /** 0-100 normalized popularity score (derived from total views if absent). */
  popularity?: number;
  status?: string;
}

export interface AlbumRef {
  id: string;
  type?: 'album';
  title: string;
  name?: string;
  coverUrl?: string;
  images?: AlbumImage[];
  releaseYear: number;
  releaseDate?: string;
  albumType: AlbumType;
  songsCount: number;
  totalTracks?: number;
  artists?: AlbumSimplifiedArtist[];
  status?: string;
}

/** Track in album creation flow. */
export interface AlbumTrack {
  songId: string;
  songTitle: string;
  versionId?: string;
  versionName?: string;
  instrumentName?: string;
  trackNumber: number;
}

/** Track payload for album creation (simplified for backend). */
export interface AlbumTrackPayload {
  songId: string;
  songTitle: string;
  trackNumber: number;
}

/** Payload for creating a new album. */
export interface CreateAlbumPayload {
  title: string;
  artistId: number;
  artistName: string;
  releaseYear?: number;
  albumType: AlbumType;
  genre: string;
  coverImageUrl?: string;
  tracks: AlbumTrack[];
}

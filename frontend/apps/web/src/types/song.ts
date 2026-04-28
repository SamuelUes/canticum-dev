export interface SongVersionDocument {
  songId: string;
  versionId: string;
  artistId?: string;
  instrumentId?: string;
  versionName: string;
  tone?: string;
  notationType?: string;
  audioReferenceUrl?: string;
  isPremium: boolean;
}

export interface SongVersion {
  id: string;
  songId?: SongVersionDocument['songId'];
  versionId?: SongVersionDocument['versionId'];
  versionName?: SongVersionDocument['versionName'];
  artistId?: SongVersionDocument['artistId'];
  instrumentId?: SongVersionDocument['instrumentId'];
  tone?: SongVersionDocument['tone'];
  notationType?: SongVersionDocument['notationType'];
  audioReferenceUrl?: SongVersionDocument['audioReferenceUrl'];
  artistName: string;
  instrumentName?: string;
  label: string;
  isPremium?: boolean;
  /** Per-version lyrics text (replaces legacy song-level lyrics). */
  lyrics?: string;
  /** Optional uploaded lyrics file URL. */
  lyricsFileUrl?: string;
  /** Optional uploaded sheet music file URL. */
  sheetFileUrl?: string;
}

export interface SongInstrument {
  id: string;
  name: string;
}

export interface SongUserAccess {
  isAuthenticated: boolean;
  isPremiumUser: boolean;
  hasSongUnlock: boolean;
  canPurchaseIndividually: boolean;
  individualPriceUsd?: number;
}

/** Spotify-aligned image descriptor (largest first when in a list). */
export interface SongImage {
  url: string;
  width?: number;
  height?: number;
}

/** External identifiers block, Spotify-aligned (e.g. `{ isrc }`). */
export interface SongExternalIds {
  isrc?: string;
}

/** External URLs block (e.g. `{ canticum, spotify? }`). */
export interface SongExternalUrls {
  canticum?: string;
  spotify?: string;
}

/** Simplified artist reference, mirrors Spotify's simplified artist object. */
export interface SongSimplifiedArtist {
  id: string;
  name: string;
  type: 'artist';
  href?: string;
  externalUrls?: SongExternalUrls;
}

/** Simplified album reference, mirrors Spotify's simplified album object. */
export interface SongSimplifiedAlbum {
  id: string;
  name: string;
  type: 'album';
  /** 'album' | 'single' | 'ep' | 'compilation' | 'live' */
  albumType: string;
  totalTracks: number;
  images?: SongImage[];
  releaseDate?: string;
  /** 'year' | 'month' | 'day' */
  releaseDatePrecision?: 'year' | 'month' | 'day';
  artists?: SongSimplifiedArtist[];
  href?: string;
  externalUrls?: SongExternalUrls;
}

export interface SongDetail {
  id: string;
  /** Spotify-aligned discriminator. Always `'song'`. */
  type?: 'song';
  /** Canonical title. */
  title: string;
  /** Spotify-aligned alias of `title` (mirror). */
  name?: string;
  /** Primary artist display name (back-compat shortcut of `artists[0].name`). */
  artistName: string;
  /** Spotify-aligned list of participating artists. First entry is the primary. */
  artists?: SongSimplifiedArtist[];
  /** Album to which the song belongs (if any). Spotify-aligned. */
  album?: SongSimplifiedAlbum;
  /** Ordered image variants (largest first). */
  images?: SongImage[];
  /** Track duration in milliseconds. */
  durationMs?: number;
  /** 1-based track number within its album. */
  trackNumber?: number;
  /** 1-based disc number within its album (default 1). */
  discNumber?: number;
  /** External identifiers (ISRC, etc.). */
  externalIds?: SongExternalIds;
  /** External URLs per provider. */
  externalUrls?: SongExternalUrls;
  /** 0-100 normalized popularity score (derived from plays/views when not stored). */
  popularity?: number;
  /** Back-compat alias of `previewUrl` / short reference sample. */
  audioUrl?: string;
  /** Spotify-aligned preview sample URL (mirror of `audioUrl`). */
  previewUrl?: string;
  lyrics: string;
  sheet?: string;
  isFavorite?: boolean;
  /** ID of the version currently projected at top-level (lyrics/audio/sheet). */
  activeVersionId?: string;
  currentVersionId: string;
  currentInstrumentId: string;
  versions: SongVersion[];
  instruments: SongInstrument[];
  userAccess?: SongUserAccess;
}

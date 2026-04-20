import { songMockById } from './mockData';
import type { SongDetail, SongImage, SongSimplifiedArtist } from '../../types/song';
import type { SongRef } from '../../types/schema';

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

function normalizeImages(raw: unknown): SongImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((entry): SongImage | null => {
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (!url) return null;
      const width = Number(obj.width);
      const height = Number(obj.height);
      return {
        url,
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined
      };
    })
    .filter((value): value is SongImage => value !== null);
  return list.length > 0 ? list : undefined;
}

function computePopularity(durationOrViews: number | undefined): number {
  // Mirror the artist `popularity` derivation: log10-based 0-100 clamp.
  if (!Number.isFinite(durationOrViews) || !durationOrViews || durationOrViews <= 0) return 0;
  const score = Math.round(Math.log10(durationOrViews + 1) * 20);
  return Math.max(0, Math.min(100, score));
}

function normalizeSongDetail(song: SongDetail): SongDetail {
  const userAccess = {
    isAuthenticated: Boolean(song.userAccess?.isAuthenticated),
    isPremiumUser: Boolean(song.userAccess?.isPremiumUser),
    hasSongUnlock: Boolean(song.userAccess?.hasSongUnlock),
    canPurchaseIndividually: Boolean(song.userAccess?.canPurchaseIndividually),
    individualPriceUsd: song.userAccess?.individualPriceUsd
  };

  // Spotify-aligned aliases: `name` mirrors `title`, `previewUrl` mirrors `audioUrl`.
  const name = song.name ?? song.title;
  const previewUrl = song.previewUrl ?? song.audioUrl;
  const audioUrl = song.audioUrl ?? song.previewUrl;
  const images = normalizeImages(song.images) ?? song.images;

  // Derive `artists[]` from single `artistName` when absent (back-compat).
  const artists: SongSimplifiedArtist[] | undefined = song.artists && song.artists.length > 0
    ? song.artists
    : song.artistName
      ? [{ id: '', name: song.artistName, type: 'artist' }]
      : undefined;

  const popularity = typeof song.popularity === 'number'
    ? Math.max(0, Math.min(100, Math.round(song.popularity)))
    : computePopularity(song.durationMs);

  return {
    ...song,
    type: 'song',
    name,
    previewUrl,
    audioUrl,
    images,
    artists,
    discNumber: song.discNumber ?? 1,
    popularity,
    userAccess,
    versions: song.versions.map((version) => ({
      ...version,
      songId: version.songId ?? song.id,
      versionId: version.versionId ?? version.id,
      versionName: version.versionName ?? version.label,
      isPremium: Boolean(version.isPremium),
      audioReferenceUrl: version.audioReferenceUrl ?? audioUrl
    }))
  };
}

function isSongDetail(value: unknown): value is SongDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const song = value as Partial<SongDetail>;
  return typeof song.id === 'string' && typeof song.title === 'string' && Array.isArray(song.versions) && Array.isArray(song.instruments);
}

function extractSongPayload(payload: unknown): SongDetail | null {
  if (isSongDetail(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { song?: unknown };
  return isSongDetail(envelope.song) ? envelope.song : null;
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { auth } = await import('../../services/firebase');
    if (!auth?.currentUser) {
      return null;
    }

    return auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function getSongDetailFromFunctions(songId: string): Promise<SongDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${functionsBaseUrl}/songs/${songId}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const song = extractSongPayload(payload);

    if (!song) {
      return null;
    }

    return normalizeSongDetail(song);
  } catch {
    return null;
  }
}

export async function getSongDetailById(songId: string): Promise<SongDetail | null> {
  const remoteSong = await getSongDetailFromFunctions(songId);

  if (remoteSong) {
    return remoteSong;
  }

  const song = songMockById[songId];

  if (!song) {
    return null;
  }

  return normalizeSongDetail(song);
}

export async function getSongTitleById(songId: string): Promise<SongRef | null> {
  if (functionsBaseUrl) {
    try {
      const response = await fetch(`${functionsBaseUrl}/songs/${songId}`, {
        method: 'GET',
        cache: 'no-store'
      });

      if (response.ok) {
        const payload = (await response.json()) as unknown;
        const raw = (payload && typeof payload === 'object' && 'song' in (payload as object)
          ? (payload as { song: unknown }).song
          : payload) as Partial<SongDetail> | null;

        if (raw && typeof raw.id === 'string' && typeof raw.title === 'string') {
          return {
            id: raw.id,
            title: raw.title,
            artistName: typeof raw.artistName === 'string' ? raw.artistName : undefined,
            audioUrl: typeof raw.audioUrl === 'string' ? raw.audioUrl : undefined
          };
        }
      }
    } catch {
    }
  }

  const mock = songMockById[songId];
  if (!mock) {
    return null;
  }

  return {
    id: mock.id,
    title: mock.title,
    artistName: mock.artistName,
    audioUrl: mock.audioUrl
  };
}

import { albumMockById, albumsByArtistMock } from './mockData';
import type {
  AlbumCopyright,
  AlbumDetail,
  AlbumImage,
  AlbumRef,
  AlbumSimplifiedArtist,
  AlbumSongRow,
  AlbumTracksBucket,
  AlbumType
} from '../../types/album';

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

function normalizeAlbumType(raw: unknown): AlbumType {
  const valid: AlbumType[] = ['album', 'single', 'ep', 'compilation', 'live'];
  if (typeof raw === 'string' && valid.includes(raw as AlbumType)) {
    return raw as AlbumType;
  }
  return 'album';
}

function normalizeImages(raw: unknown, fallbackUrl?: string): AlbumImage[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw
      .map((entry): AlbumImage | null => {
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
      .filter((value): value is AlbumImage => value !== null);
    if (list.length > 0) return list;
  }
  return fallbackUrl ? [{ url: fallbackUrl }] : undefined;
}

function normalizeReleaseDatePrecision(raw: unknown): 'year' | 'month' | 'day' | undefined {
  return raw === 'year' || raw === 'month' || raw === 'day' ? raw : undefined;
}

function normalizeArtists(raw: unknown): AlbumSimplifiedArtist[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((entry): AlbumSimplifiedArtist | null => {
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name : '';
      if (!name) return null;
      return {
        id: String(obj.id ?? ''),
        name,
        type: 'artist',
        href: typeof obj.href === 'string' ? obj.href : undefined,
        imageUrl: typeof obj.imageUrl === 'string' ? obj.imageUrl : undefined
      };
    })
    .filter((value): value is AlbumSimplifiedArtist => value !== null);
  return list.length > 0 ? list : undefined;
}

function normalizeCopyrights(raw: unknown): AlbumCopyright[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((entry): AlbumCopyright | null => {
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const text = typeof obj.text === 'string' ? obj.text : '';
      if (!text) return null;
      const t = obj.type === 'C' || obj.type === 'P' ? obj.type : 'C';
      return { text, type: t };
    })
    .filter((v): v is AlbumCopyright => v !== null);
  return list.length > 0 ? list : undefined;
}

function computePopularity(raw: unknown, totalViews: number): number {
  const stored = Number(raw);
  if (Number.isFinite(stored) && stored >= 0) return Math.min(100, Math.round(stored));
  if (!Number.isFinite(totalViews) || totalViews <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(Math.log10(totalViews + 1) * 20)));
}

function normalizeAlbumSongRow(raw: Record<string, unknown>, index: number): AlbumSongRow {
  const title = String(raw.title ?? raw.name ?? '');
  return {
    id: String(raw.id ?? ''),
    type: 'song',
    title,
    name: typeof raw.name === 'string' ? raw.name : title,
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' && raw.thumbnailUrl ? raw.thumbnailUrl : undefined,
    trackNumber: raw.trackNumber !== undefined ? Number(raw.trackNumber) : index + 1,
    discNumber: raw.discNumber !== undefined ? Number(raw.discNumber) : 1,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    artists: normalizeArtists(raw.artists),
    externalUrls: raw.externalUrls && typeof raw.externalUrls === 'object'
      ? (raw.externalUrls as Record<string, string>)
      : undefined,
    tone: String(raw.tone ?? ''),
    views: Number(raw.views ?? 0),
    hasLyrics: Boolean(raw.hasLyrics),
    hasSheet: Boolean(raw.hasSheet),
    isPrimaryRelease: Boolean(raw.isPrimaryRelease),
    isVerified: Boolean(raw.isVerified)
  };
}

function buildTracksBucket(albumId: string, items: AlbumSongRow[], rawTracks: unknown): AlbumTracksBucket {
  if (rawTracks && typeof rawTracks === 'object' && Array.isArray((rawTracks as Record<string, unknown>).items)) {
    const obj = rawTracks as Record<string, unknown>;
    return {
      href: typeof obj.href === 'string' ? obj.href : `/albums/${albumId}/tracks?offset=0&limit=50`,
      limit: Number(obj.limit ?? items.length),
      offset: Number(obj.offset ?? 0),
      total: Number(obj.total ?? items.length),
      next: typeof obj.next === 'string' ? obj.next : null,
      previous: typeof obj.previous === 'string' ? obj.previous : null,
      items
    };
  }
  return {
    href: `/albums/${albumId}/tracks?offset=0&limit=50`,
    limit: items.length,
    offset: 0,
    total: items.length,
    next: null,
    previous: null,
    items
  };
}

function normalizeAlbumDetail(raw: Record<string, unknown>): AlbumDetail {
  const songs: AlbumSongRow[] = Array.isArray(raw.songs)
    ? (raw.songs as unknown[])
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map(normalizeAlbumSongRow)
        .filter((s) => s.id.length > 0)
    : Array.isArray((raw.tracks as { items?: unknown[] } | undefined)?.items)
      ? ((raw.tracks as { items: unknown[] }).items)
          .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
          .map(normalizeAlbumSongRow)
          .filter((s) => s.id.length > 0)
      : [];

  const id = String(raw.id ?? '');
  const title = String(raw.title ?? raw.name ?? '');
  const coverUrl = typeof raw.coverUrl === 'string' && raw.coverUrl ? raw.coverUrl : undefined;
  const images = normalizeImages(raw.images, coverUrl);
  const artistId = String(raw.artistId ?? '');
  const artistName = String(raw.artistName ?? '');
  const artists = normalizeArtists(raw.artists) ?? (artistName
    ? [{ id: artistId, name: artistName, type: 'artist' as const, imageUrl: typeof raw.artistImageUrl === 'string' ? raw.artistImageUrl : undefined }]
    : undefined);
  const totalViews = songs.reduce((acc, s) => acc + (Number.isFinite(s.views) ? s.views : 0), 0);
  const popularity = computePopularity(raw.popularity, totalViews);
  const totalTracks = Number(raw.totalTracks ?? raw.songsCount ?? songs.length);

  return {
    id,
    type: 'album',
    title,
    name: typeof raw.name === 'string' ? raw.name : title,
    description: typeof raw.description === 'string' && raw.description ? raw.description : undefined,
    coverUrl: coverUrl ?? images?.[0]?.url,
    images,
    releaseYear: Number(raw.releaseYear ?? (typeof raw.releaseDate === 'string' ? Number((raw.releaseDate as string).slice(0, 4)) : new Date().getFullYear())),
    releaseDate: typeof raw.releaseDate === 'string' ? raw.releaseDate : undefined,
    releaseDatePrecision: normalizeReleaseDatePrecision(raw.releaseDatePrecision),
    albumType: normalizeAlbumType(raw.albumType),
    artistId,
    artistName,
    artistImageUrl: typeof raw.artistImageUrl === 'string' && raw.artistImageUrl ? raw.artistImageUrl : undefined,
    artists,
    songsCount: totalTracks,
    totalTracks,
    tracks: buildTracksBucket(id, songs, raw.tracks),
    songs,
    label: typeof raw.label === 'string' ? raw.label : undefined,
    genres: Array.isArray(raw.genres) ? (raw.genres as unknown[]).filter((g): g is string => typeof g === 'string') : undefined,
    copyrights: normalizeCopyrights(raw.copyrights),
    externalIds: raw.externalIds && typeof raw.externalIds === 'object'
      ? { upc: typeof (raw.externalIds as Record<string, unknown>).upc === 'string' ? (raw.externalIds as Record<string, string>).upc : undefined }
      : undefined,
    externalUrls: {
      canticum: `/albums/${id}`,
      ...(raw.externalUrls && typeof raw.externalUrls === 'object' ? (raw.externalUrls as Record<string, string>) : {})
    },
    popularity
  };
}

function hasAlbumShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.title === 'string';
}

function extractAlbumPayload(payload: unknown): Record<string, unknown> | null {
  if (hasAlbumShape(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { album?: unknown };
  return hasAlbumShape(envelope.album) ? envelope.album : null;
}

async function getAlbumDetailFromFunctions(albumId: string): Promise<AlbumDetail | null> {
  if (!functionsBaseUrl) return null;

  try {
    const response = await fetch(`${functionsBaseUrl}/albums/${albumId}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    const raw = extractAlbumPayload(payload);
    return raw ? normalizeAlbumDetail(raw) : null;
  } catch {
    return null;
  }
}

export async function getAlbumDetailById(albumId: string): Promise<AlbumDetail | null> {
  const remote = await getAlbumDetailFromFunctions(albumId);
  if (remote) return remote;
  const mock = albumMockById[albumId];
  return mock ? normalizeAlbumDetail(mock as unknown as Record<string, unknown>) : null;
}

async function getAlbumsByArtistFromFunctions(artistId: string): Promise<AlbumRef[] | null> {
  if (!functionsBaseUrl) return null;

  try {
    const response = await fetch(`${functionsBaseUrl}/albums?artistId=${encodeURIComponent(artistId)}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object') return null;

    const list = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { albums?: unknown }).albums)
        ? ((payload as { albums: unknown[] }).albums)
        : null;

    if (!list) return null;

    return list
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const id = String(item.id ?? '');
        const title = String(item.title ?? item.name ?? '');
        const coverUrl = typeof item.coverUrl === 'string' && item.coverUrl ? item.coverUrl : undefined;
        const images = normalizeImages(item.images, coverUrl);
        const totalTracks = Number(item.totalTracks ?? item.songsCount ?? 0);
        return {
          id,
          type: 'album' as const,
          title,
          name: typeof item.name === 'string' ? item.name : title,
          coverUrl: coverUrl ?? images?.[0]?.url,
          images,
          releaseYear: Number(item.releaseYear ?? (typeof item.releaseDate === 'string' ? Number((item.releaseDate as string).slice(0, 4)) : 0)),
          releaseDate: typeof item.releaseDate === 'string' ? item.releaseDate : undefined,
          albumType: normalizeAlbumType(item.albumType),
          songsCount: totalTracks,
          totalTracks,
          artists: normalizeArtists(item.artists)
        };
      })
      .filter((a) => a.id.length > 0);
  } catch {
    return null;
  }
}

export async function getAlbumsByArtist(artistId: string): Promise<AlbumRef[]> {
  const remote = await getAlbumsByArtistFromFunctions(artistId);
  if (remote) return remote;

  const ids = albumsByArtistMock[artistId] ?? [];
  return ids
    .map((id) => albumMockById[id])
    .filter(Boolean)
    .map((album) => ({
      id: album.id,
      type: 'album' as const,
      title: album.title,
      name: album.title,
      coverUrl: album.coverUrl,
      images: album.coverUrl ? [{ url: album.coverUrl }] : undefined,
      releaseYear: album.releaseYear,
      albumType: album.albumType,
      songsCount: album.songsCount,
      totalTracks: album.songsCount,
      artists: [{ id: album.artistId, name: album.artistName, type: 'artist' as const, imageUrl: album.artistImageUrl }]
    }));
}

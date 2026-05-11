import { artistMockById } from './mockData';

const functionsBaseUrl = [
  process.env.GCP_FUNCTIONS_BASE_URL,
  process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL
]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .find((value) => value.length > 0)?.replace(/\/$/, '') ?? '';

function normalizeArtistName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveArtistIdFromMock(artistName: string): string | null {
  const target = normalizeArtistName(artistName);
  const foundId = Object.keys(artistMockById).find(
    (id) => normalizeArtistName(artistMockById[id].name) === target
  );
  return foundId ?? null;
}

async function resolveArtistIdFromSearch(artistName: string): Promise<string | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `${functionsBaseUrl}/search/catalog?q=${encodeURIComponent(artistName)}&kind=artist`,
      { method: 'GET', cache: 'no-store' }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const results = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { results?: unknown }).results)
        ? (payload as { results: unknown[] }).results
        : [];

    const target = normalizeArtistName(artistName);

    for (const item of results) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (
        (obj.kind === 'artist' || !obj.kind) &&
        typeof obj.id === 'string' &&
        typeof obj.name === 'string' &&
        normalizeArtistName(obj.name) === target
      ) {
        return obj.id;
      }
    }
  } catch {
  }

  return null;
}

interface ArtistProfileRouteInput {
  artistId?: string;
  artistName?: string;
}

function toArtistSlug(artistName: string): string {
  return artistName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export function getArtistProfileHref({ artistId, artistName }: ArtistProfileRouteInput): string {
  const slug = artistName?.trim() ? toArtistSlug(artistName) : '';

  if (artistId) {
    const safeSlug = slug || 'artist';
    return `/artists/${encodeURIComponent(safeSlug)}?id=${encodeURIComponent(artistId)}`;
  }

  if (!artistName?.trim()) {
    return '/search';
  }

  const mockId = resolveArtistIdFromMock(artistName);
  if (mockId) {
    return `/artists/${encodeURIComponent(slug || mockId)}?id=${encodeURIComponent(mockId)}`;
  }

  if (slug) {
    return `/artists/${encodeURIComponent(slug)}`;
  }

  return `/search?q=${encodeURIComponent(artistName.trim())}`;
}

export async function getArtistProfileHrefAsync({ artistId, artistName }: ArtistProfileRouteInput): Promise<string> {
  const slug = artistName?.trim() ? toArtistSlug(artistName) : '';

  if (artistId) {
    return `/artists/${encodeURIComponent(slug || 'artist')}?id=${encodeURIComponent(artistId)}`;
  }

  if (!artistName?.trim()) {
    return '/search';
  }

  const remoteId = await resolveArtistIdFromSearch(artistName);
  if (remoteId) {
    return `/artists/${encodeURIComponent(slug || remoteId)}?id=${encodeURIComponent(remoteId)}`;
  }

  const mockId = resolveArtistIdFromMock(artistName);
  if (mockId) {
    return `/artists/${encodeURIComponent(slug || mockId)}?id=${encodeURIComponent(mockId)}`;
  }

  return `/search?q=${encodeURIComponent(artistName.trim())}`;
}

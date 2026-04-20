import { artistMockById } from './mockData';

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

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

export function getArtistProfileHref({ artistId, artistName }: ArtistProfileRouteInput): string {
  if (artistId) {
    return `/artists/${artistId}`;
  }

  if (!artistName?.trim()) {
    return '/search';
  }

  const mockId = resolveArtistIdFromMock(artistName);
  if (mockId) {
    return `/artists/${mockId}`;
  }

  return `/search?q=${encodeURIComponent(artistName.trim())}`;
}

export async function getArtistProfileHrefAsync({ artistId, artistName }: ArtistProfileRouteInput): Promise<string> {
  if (artistId) {
    return `/artists/${artistId}`;
  }

  if (!artistName?.trim()) {
    return '/search';
  }

  const remoteId = await resolveArtistIdFromSearch(artistName);
  if (remoteId) {
    return `/artists/${remoteId}`;
  }

  const mockId = resolveArtistIdFromMock(artistName);
  if (mockId) {
    return `/artists/${mockId}`;
  }

  return `/search?q=${encodeURIComponent(artistName.trim())}`;
}

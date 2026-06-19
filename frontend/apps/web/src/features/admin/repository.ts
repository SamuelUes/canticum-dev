import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';

export interface AdminUserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  plan: string;
  premium: boolean;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminUsersResponse {
  ok: boolean;
  total: number;
  items: AdminUserSummary[];
}

export interface BulkDeleteSongsResponse {
  deletedCount: number;
  firestoreDeletedCount: number;
  sqlErrors?: string[];
  firestoreErrors?: string[];
  message?: string;
}

export interface AdminDashboardMetrics {
  totalSongs: number;
  pendingSongs: number;
  totalArtists: number;
  totalRepertoires: number;
  newUsersLast48h: number;
}

export interface AdminDashboardMetricsResponse {
  ok: boolean;
  metrics: AdminDashboardMetrics;
}

export interface DraftSong {
  id: number;
  title: string;
  artistName: string | null;
  createdAt: string;
  stateCode: string;
  firestoreId: string | null;
}

export interface DraftSongsResponse {
  ok: boolean;
  songs: DraftSong[];
  total: number;
  limit: number;
  offset: number;
}

export interface Artist {
  id: number;
  name: string;
  createdAt: string;
  songCount: number;
}

export interface ArtistDetail {
  id: number;
  name: string;
  type: string;
  bio: string | null;
  imageUrl: string | null;
  images: Array<{ url: string; width?: number; height?: number }>;
  genres: string[];
  categories: string[];
  likeCount: number;
  totalViews: number;
  popularity: number;
  status: string;
  isOfficial: boolean;
  createdAt: string;
}

export interface ArtistDetailResponse {
  ok: boolean;
  artist: ArtistDetail;
}

export interface ArtistsResponse {
  ok: boolean;
  artists: Artist[];
  total: number;
  limit: number;
  offset: number;
}

export interface NewsletterResponse {
  ok: boolean;
  imageUrl: string | null;
}

export interface NewsletterUploadResponse {
  ok: boolean;
  imageUrl: string;
  storagePath: string;
}

function assertFunctionsConfigured(): string {
  if (!functionsBaseUrl) {
    throw new Error('Functions base URL not configured.');
  }

  return functionsBaseUrl;
}

async function parseJsonError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === 'object') {
      const error = (payload as { error?: { message?: unknown } }).error;
      if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
        return error.message;
      }

      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
  } catch {
  }

  return fallbackMessage;
}

export async function fetchAdminUsers(limit = 12): Promise<AdminUserSummary[]> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/users/admin?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo cargar la lista de usuarios.'));
  }

  const payload = (await response.json()) as Partial<AdminUsersResponse>;
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function updateAdminUser(uid: string, input: { status?: 'active' | 'away'; role?: string }): Promise<AdminUserSummary> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/users/admin/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(input),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo actualizar el usuario.'));
  }

  const payload = (await response.json()) as { user?: AdminUserSummary };
  if (!payload.user) {
    throw new Error('No se pudo actualizar el usuario.');
  }

  return payload.user;
}

export async function deleteAdminUser(uid: string): Promise<AdminUserSummary> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/users/admin/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo suspender el usuario.'));
  }

  const payload = (await response.json()) as { user?: AdminUserSummary };
  if (!payload.user) {
    throw new Error('No se pudo suspender el usuario.');
  }

  return payload.user;
}

export async function bulkDeleteSongsBeforeDate(): Promise<BulkDeleteSongsResponse> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/songs/admin/bulk-delete-before-date`, {
    method: 'DELETE',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo eliminar las canciones antiguas.'));
  }

  return (await response.json()) as BulkDeleteSongsResponse;
}

export async function fetchAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/metrics`, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo cargar las métricas del panel.'));
  }

  const payload = (await response.json()) as Partial<AdminDashboardMetricsResponse>;
  if (!payload.ok || !payload.metrics) {
    throw new Error('No se pudo cargar las métricas del panel.');
  }

  return payload.metrics;
}

export async function fetchDraftSongs(limit = 10, offset = 0): Promise<{ songs: DraftSong[]; total: number; limit: number; offset: number }> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/draft-songs?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo cargar las canciones en borrador.'));
  }

  const payload = (await response.json()) as Partial<DraftSongsResponse>;
  if (!payload.ok || !Array.isArray(payload.songs)) {
    throw new Error('No se pudo cargar las canciones en borrador.');
  }

  return {
    songs: payload.songs,
    total: payload.total ?? 0,
    limit: payload.limit ?? limit,
    offset: payload.offset ?? offset
  };
}

export async function fetchArtists(limit = 10, offset = 0): Promise<{ artists: Artist[]; total: number; limit: number; offset: number }> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/artists?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo cargar los artistas.'));
  }

  const payload = (await response.json()) as Partial<ArtistsResponse>;
  if (!payload.ok || !Array.isArray(payload.artists)) {
    throw new Error('No se pudo cargar los artistas.');
  }

  return {
    artists: payload.artists,
    total: payload.total ?? 0,
    limit: payload.limit ?? limit,
    offset: payload.offset ?? offset
  };
}

export async function fetchNewsletterImage(): Promise<string | null> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/newsletter`, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo cargar la imagen del newsletter.'));
  }

  const payload = (await response.json()) as Partial<NewsletterResponse>;
  if (!payload.ok) {
    throw new Error('No se pudo cargar la imagen del newsletter.');
  }

  return payload.imageUrl ?? null;
}

export async function uploadNewsletterImage(file: File): Promise<{ imageUrl: string; storagePath: string }> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({});
  const response = await fetch(`${baseUrl}/admin-admin/newsletter`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo subir la imagen del newsletter.'));
  }

  const payload = (await response.json()) as Partial<NewsletterUploadResponse>;
  if (!payload.ok || !payload.imageUrl || !payload.storagePath) {
    throw new Error('No se pudo subir la imagen del newsletter.');
  }

  return {
    imageUrl: payload.imageUrl,
    storagePath: payload.storagePath,
  };
}

export async function getArtistForAdmin(artistId: number): Promise<ArtistDetail> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const url = `${baseUrl}/admin-admin/artists/${encodeURIComponent(String(artistId))}`;
  // console.log('getArtistForAdmin: Fetching from', url);
  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store'
  });

  // console.log('getArtistForAdmin: Response status', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await parseJsonError(response, 'No se pudo cargar el artista.');
    console.error('getArtistForAdmin: Response not ok', errorText);
    throw new Error(errorText);
  }

  const payload = (await response.json()) as Partial<ArtistDetailResponse>;
  // console.log('getArtistForAdmin: Response payload', payload);
  if (!payload.ok || !payload.artist) {
    console.error('getArtistForAdmin: Invalid payload', payload);
    throw new Error('No se pudo cargar el artista.');
  }

  return payload.artist;
}

export async function updateArtist(
  artistId: number,
  data: {
    name?: string;
    type?: string;
    bio?: string | null;
    imageUrl?: string | null;
    images?: Array<{ url: string; width?: number; height?: number }>;
    genres?: string[];
    categories?: string[];
    isOfficial?: boolean;
  }
): Promise<ArtistDetail> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/artists/${encodeURIComponent(String(artistId))}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo actualizar el artista.'));
  }

  const payload = (await response.json()) as Partial<ArtistDetailResponse>;
  if (!payload.ok || !payload.artist) {
    throw new Error('No se pudo actualizar el artista.');
  }

  return payload.artist;
}

export async function softDeleteArtist(artistId: number): Promise<ArtistDetail> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/artists/${encodeURIComponent(String(artistId))}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'inactive' }),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo desactivar el artista.'));
  }

  const payload = (await response.json()) as Partial<ArtistDetailResponse>;
  if (!payload.ok || !payload.artist) {
    throw new Error('No se pudo desactivar el artista.');
  }

  return payload.artist;
}

export async function hardDeleteArtist(artistId: number): Promise<void> {
  const baseUrl = assertFunctionsConfigured();
  const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
  const response = await fetch(`${baseUrl}/admin-admin/artists/${encodeURIComponent(String(artistId))}`, {
    method: 'DELETE',
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response, 'No se pudo eliminar el artista.'));
  }
}

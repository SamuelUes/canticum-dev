import { repertoireListMock, repertoireMockById } from './mockData';
import type { RepertoireSelectedSong, repertoireDetail, repertoireListItem, SongRef } from '../../types/repertoire';
import { getSongTitleById } from '../song/repository';
import { buildFunctionsHeaders, functionsBaseUrl } from '../shared/functionsClient';
import { normalizeRepertoireStatus } from './status';

function parseUnknownDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    if ('toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      try {
        const parsed = (value as { toDate: () => Date }).toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      } catch {
        return null;
      }
    }

    const seconds = Number((value as { _seconds?: unknown; seconds?: unknown })._seconds ?? (value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

export function formatDateForUi(value: unknown): string {
  const date = parseUnknownDate(value);
  if (!date) {
    return 'N/D';
  }

  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

async function getPublicrepertoireDetailFromFunctions(repertoireId: string): Promise<repertoireDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${functionsBaseUrl}/repertoires?public=true`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const rawList = (payload as { repertoires?: unknown }).repertoires;
    if (!Array.isArray(rawList)) {
      return null;
    }

    const match = rawList.find((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const id = String((item as Record<string, unknown>).id ?? '');
      return id === repertoireId;
    });

    if (!match || typeof match !== 'object') {
      return null;
    }

    return extractrepertoirePayload(match);
  } catch {
    return null;
  }
}

function isrepertoireDetail(value: unknown): value is repertoireDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const repertoire = value as Partial<repertoireDetail>;
  return typeof repertoire.id === 'string' && typeof repertoire.title === 'string';
}

function normalizerepertoireDetail(raw: repertoireDetail): repertoireDetail {
  const selectedSongs = Array.isArray(raw.selectedSongs)
    ? raw.selectedSongs
      .filter((value): value is RepertoireSelectedSong => Boolean(value) && typeof value === 'object')
      .map((value) => ({
        songId: typeof value.songId === 'string' ? value.songId : '',
        ...(typeof value.versionId === 'string' && value.versionId.trim().length > 0
          ? { versionId: value.versionId }
          : {})
      }))
      .filter((value) => value.songId.length > 0)
    : [];

  const songIdsFromRaw = Array.isArray(raw.songIds) ? raw.songIds.filter((id): id is string => typeof id === 'string') : [];
  const songIds = songIdsFromRaw.length > 0
    ? songIdsFromRaw
    : selectedSongs.map((entry) => entry.songId);
  const calculatedCount = songIds.length;

  return {
    ...raw,
    createdAt: formatDateForUi((raw as unknown as { updatedAt?: unknown }).updatedAt ?? raw.createdAt),
    status: normalizeRepertoireStatus(raw.status) === 'DRAFT'
      ? 'Borrador'
      : normalizeRepertoireStatus(raw.status) === 'IN_REVIEW'
        ? 'En revisión'
        : normalizeRepertoireStatus(raw.status) === 'REJECTED'
          ? 'Rechazado'
          : normalizeRepertoireStatus(raw.status) === 'APPROVED'
            ? 'Aprobado'
            : 'Publicado',
    songIds,
    selectedSongs,
    songsCount: calculatedCount > 0 ? calculatedCount : Number(raw.songsCount ?? 0),
    sheetsCount: calculatedCount > 0 ? calculatedCount : Number(raw.sheetsCount ?? 0)
  };
}

function extractrepertoirePayload(payload: unknown): repertoireDetail | null {
  if (isrepertoireDetail(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { repertoire?: unknown };
  return isrepertoireDetail(envelope.repertoire) ? envelope.repertoire : null;
}

async function getrepertoireDetailFromFunctions(repertoireId: string): Promise<repertoireDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return extractrepertoirePayload(payload);
  } catch {
    return null;
  }
}

function buildSongSelectionEntries(songIds: string[], selectedSongs?: RepertoireSelectedSong[]): RepertoireSelectedSong[] {
  if (Array.isArray(selectedSongs) && selectedSongs.length > 0) {
    return selectedSongs;
  }

  return songIds.map((songId) => ({ songId }));
}

interface SongSearchOption {
  songId: string;
  versionId: string | null;
  title: string;
  artistName: string | null;
}

async function searchSongFromRepertoireSearch(songId: string, versionId?: string): Promise<SongRef | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  const queries = [songId, versionId].filter((value): value is string => Boolean(value && value.trim().length > 0));

  for (const query of queries) {
    try {
      const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
      const response = await fetch(
        `${functionsBaseUrl}/repertoires/song-search?q=${encodeURIComponent(query)}&limit=12`,
        {
          method: 'GET',
          headers,
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as unknown;
      const options = payload && typeof payload === 'object' && Array.isArray((payload as { options?: unknown }).options)
        ? (payload as { options: unknown[] }).options
        : [];

      const normalized: SongSearchOption[] = options
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          songId: String(entry.songId ?? ''),
          versionId: typeof entry.versionId === 'string' ? entry.versionId : null,
          title: String(entry.title ?? ''),
          artistName: typeof entry.artistName === 'string' ? entry.artistName : null
        }))
        .filter((entry) => entry.songId.length > 0 && entry.title.length > 0);

      const exact = normalized.find((entry) => {
        const bySong = entry.songId === songId;
        const byVersion = versionId ? entry.versionId === versionId : true;
        return bySong && byVersion;
      }) ?? normalized.find((entry) => entry.songId === songId);

      if (!exact) {
        continue;
      }

      return {
        id: exact.songId,
        title: exact.title,
        artistName: exact.artistName ?? undefined,
        ...(versionId ? { versionId } : exact.versionId ? { versionId: exact.versionId } : {})
      };
    } catch {
    }
  }

  return null;
}

async function resolveSongRefs(songSelections: RepertoireSelectedSong[]): Promise<SongRef[]> {
  if (songSelections.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(songSelections.map((item) => getSongTitleById(item.songId, item.versionId)));
  const resolved: SongRef[] = [];

  for (const [index, result] of results.entries()) {
    const selected = songSelections[index];

    if (result.status === 'fulfilled' && result.value) {
      resolved.push({
        ...result.value,
        ...(result.value.versionId
          ? { versionId: result.value.versionId }
          : selected?.versionId
            ? { versionId: selected.versionId }
            : {})
      });
      continue;
    }

    const fallbackSongId = selected?.songId ?? '';
    const viaSearch = await searchSongFromRepertoireSearch(fallbackSongId, selected?.versionId);
    if (viaSearch) {
      const canonical = await getSongTitleById(viaSearch.id, viaSearch.versionId);
      resolved.push(
        canonical
          ? {
              ...viaSearch,
              id: canonical.id,
              ...(canonical.versionId ? { versionId: canonical.versionId } : viaSearch.versionId ? { versionId: viaSearch.versionId } : {})
            }
          : viaSearch
      );
      continue;
    }

    resolved.push({
      id: fallbackSongId,
      title: fallbackSongId,
      ...(selected?.versionId ? { versionId: selected.versionId } : {})
    });
  }

  return resolved;
}

export async function getrepertoireDetailById(repertoireId: string): Promise<repertoireDetail | null> {
  const remote = await getrepertoireDetailFromFunctions(repertoireId);
  const publicFallback = remote ? null : await getPublicrepertoireDetailFromFunctions(repertoireId);
  const base = remote ?? publicFallback ?? repertoireMockById[repertoireId] ?? null;

  if (!base) {
    return null;
  }

  const normalized = normalizerepertoireDetail(base);
  const selections = buildSongSelectionEntries(normalized.songIds, normalized.selectedSongs);
  const songs = await resolveSongRefs(selections);

  return { ...normalized, songs };
}

function isrepertoireListItem(value: unknown): value is repertoireListItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<repertoireListItem>;
  return typeof item.id === 'string' && typeof item.title === 'string';
}

function normalizerepertoireListItem(rawItem: Record<string, unknown>): repertoireListItem {
  const normalizedStatus = normalizeRepertoireStatus(rawItem.status);
  const status = normalizedStatus === 'DRAFT'
    ? 'Borrador'
    : normalizedStatus === 'IN_REVIEW'
      ? 'En revisión'
      : normalizedStatus === 'REJECTED'
        ? 'Rechazado'
        : normalizedStatus === 'APPROVED'
          ? 'Aprobado'
          : 'Publicado';
  const songIds = Array.isArray(rawItem.songIds) ? rawItem.songIds.filter((id): id is string => typeof id === 'string') : [];
  const countFromIds = songIds.length;

  return {
    id: String(rawItem.id ?? ''),
    title: String(rawItem.title ?? 'repertorio sin título'),
    subtitle: String(rawItem.subtitle ?? rawItem.description ?? ''),
    dateLabel: formatDateForUi(rawItem.dateLabel ?? rawItem.updatedAt ?? rawItem.createdAt),
    liturgicalType: String(rawItem.liturgicalType ?? 'General'),
    status,
    songsCount: countFromIds > 0 ? countFromIds : Number(rawItem.songsCount ?? 0),
    sheetsCount: countFromIds > 0 ? countFromIds : Number(rawItem.sheetsCount ?? 0),
    coverImageUrl: typeof rawItem.coverImageUrl === 'string' && rawItem.coverImageUrl.length > 0 ? rawItem.coverImageUrl : undefined,
    songIds,
    ownerUserId: String(rawItem.ownerUserId ?? rawItem.userId ?? 'unknown-user'),
    isPublic: Boolean(rawItem.isPublic)
  };
}

function finalizerepertoireListItem(item: repertoireListItem): repertoireListItem {
  const songIds = Array.isArray(item.songIds) ? item.songIds.filter((id): id is string => typeof id === 'string') : [];
  const countFromIds = songIds.length;

  return {
    ...item,
    status: normalizeRepertoireStatus(item.status) === 'DRAFT'
      ? 'Borrador'
      : normalizeRepertoireStatus(item.status) === 'IN_REVIEW'
        ? 'En revisión'
        : normalizeRepertoireStatus(item.status) === 'REJECTED'
          ? 'Rechazado'
          : normalizeRepertoireStatus(item.status) === 'APPROVED'
            ? 'Aprobado'
            : 'Publicado',
    songsCount: countFromIds > 0 ? countFromIds : Number(item.songsCount ?? 0),
    sheetsCount: countFromIds > 0 ? countFromIds : Number(item.sheetsCount ?? 0),
    coverImageUrl: item.coverImageUrl && item.coverImageUrl.length > 0 ? item.coverImageUrl : undefined,
    songIds
  };
}

function extractrepertoireListPayload(payload: unknown): repertoireListItem[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => (isrepertoireListItem(item) ? finalizerepertoireListItem(item) : normalizerepertoireListItem(item)));
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const envelope = payload as { repertoires?: unknown };
  if (!Array.isArray(envelope.repertoires)) {
    return [];
  }

  return envelope.repertoires
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => (isrepertoireListItem(item) ? finalizerepertoireListItem(item) : normalizerepertoireListItem(item)));
}

async function getrepertoiresFromFunctions(userId: string): Promise<repertoireListItem[] | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const headers = await buildFunctionsHeaders({ Accept: 'application/json' });
    const response = await fetch(`${functionsBaseUrl}/repertoires?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return extractrepertoireListPayload(payload);
  } catch {
    return null;
  }
}

export async function getUserrepertoires(userId: string): Promise<repertoireListItem[]> {
  const remote = await getrepertoiresFromFunctions(userId);
  if (remote) {
    return remote.filter((item) => item.ownerUserId === userId).map(finalizerepertoireListItem);
  }

  return repertoireListMock.filter((item) => item.ownerUserId === userId).map(finalizerepertoireListItem);
}


export async function requestPublishRepertoire(repertoireId: string): Promise<{ ok: boolean; reason?: string; status?: string }> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network' };
  }

  try {
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ repertoire: { isPublic: true, status: 'PUBLISHED' } })
    });

    if (!response.ok) {
      return { ok: false, reason: String(response.status) };
    }

    const payload = (await response.json()) as { repertoire?: { status?: unknown } };
    return { ok: true, status: typeof payload.repertoire?.status === 'string' ? payload.repertoire.status : 'PUBLISHED' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function requestUpdateRepertoireStatus(
  repertoireId: string,
  status: string,
  isPublic?: boolean
): Promise<{ ok: boolean; reason?: string; status?: string }> {
  if (!functionsBaseUrl) {
    return { ok: false, reason: 'network' };
  }

  try {
    const headers = await buildFunctionsHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    const response = await fetch(`${functionsBaseUrl}/repertoires/${repertoireId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        repertoire: {
          status,
          ...(typeof isPublic === 'boolean' ? { isPublic } : {})
        }
      })
    });

    if (!response.ok) {
      return { ok: false, reason: String(response.status) };
    }

    const payload = (await response.json()) as { repertoire?: { status?: unknown } };
    return { ok: true, status: typeof payload.repertoire?.status === 'string' ? payload.repertoire.status : status };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

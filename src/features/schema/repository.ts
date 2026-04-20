import { schemaListMock, schemaMockById } from './mockData';
import type { SchemaDetail, SchemaListItem, SongRef } from '../../types/schema';
import { getSongTitleById } from '../song/repository';

const functionsBaseUrl = (process.env.GCP_FUNCTIONS_BASE_URL ?? process.env.NEXT_PUBLIC_GCP_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, '');

function isSchemaDetail(value: unknown): value is SchemaDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const schema = value as Partial<SchemaDetail>;
  return typeof schema.id === 'string' && typeof schema.title === 'string';
}

function normalizeSchemaDetail(raw: SchemaDetail): SchemaDetail {
  const songIds = Array.isArray(raw.songIds) ? raw.songIds.filter((id): id is string => typeof id === 'string') : [];
  const calculatedCount = songIds.length;

  return {
    ...raw,
    status: raw.status === 'Publicado' ? 'Publicado' : 'Borrador',
    songIds,
    songsCount: calculatedCount > 0 ? calculatedCount : Number(raw.songsCount ?? 0),
    sheetsCount: calculatedCount > 0 ? calculatedCount : Number(raw.sheetsCount ?? 0)
  };
}

function extractSchemaPayload(payload: unknown): SchemaDetail | null {
  if (isSchemaDetail(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const envelope = payload as { schema?: unknown };
  return isSchemaDetail(envelope.schema) ? envelope.schema : null;
}

async function getSchemaDetailFromFunctions(schemaId: string): Promise<SchemaDetail | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${functionsBaseUrl}/schemas/${schemaId}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return extractSchemaPayload(payload);
  } catch {
    return null;
  }
}

async function resolveSongRefs(songIds: string[]): Promise<SongRef[]> {
  if (songIds.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(songIds.map((id) => getSongTitleById(id)));

  return results.reduce<SongRef[]>((acc, result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      acc.push(result.value);
    } else {
      acc.push({ id: songIds[index], title: songIds[index] });
    }
    return acc;
  }, []);
}

export async function getSchemaDetailById(schemaId: string): Promise<SchemaDetail | null> {
  const remote = await getSchemaDetailFromFunctions(schemaId);
  const base = remote ?? schemaMockById[schemaId] ?? null;

  if (!base) {
    return null;
  }

  const normalized = normalizeSchemaDetail(base);
  const songs = await resolveSongRefs(normalized.songIds);

  return { ...normalized, songs };
}

function isSchemaListItem(value: unknown): value is SchemaListItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<SchemaListItem>;
  return typeof item.id === 'string' && typeof item.title === 'string';
}

function normalizeSchemaListItem(rawItem: Record<string, unknown>): SchemaListItem {
  const status = String(rawItem.status ?? 'Borrador') === 'Publicado' ? 'Publicado' : 'Borrador';
  const songIds = Array.isArray(rawItem.songIds) ? rawItem.songIds.filter((id): id is string => typeof id === 'string') : [];
  const countFromIds = songIds.length;

  return {
    id: String(rawItem.id ?? ''),
    title: String(rawItem.title ?? 'Esquema sin título'),
    subtitle: String(rawItem.subtitle ?? rawItem.description ?? ''),
    dateLabel: String(rawItem.dateLabel ?? rawItem.createdAt ?? 'N/D'),
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

function finalizeSchemaListItem(item: SchemaListItem): SchemaListItem {
  const songIds = Array.isArray(item.songIds) ? item.songIds.filter((id): id is string => typeof id === 'string') : [];
  const countFromIds = songIds.length;

  return {
    ...item,
    status: item.status === 'Publicado' ? 'Publicado' : 'Borrador',
    songsCount: countFromIds > 0 ? countFromIds : Number(item.songsCount ?? 0),
    sheetsCount: countFromIds > 0 ? countFromIds : Number(item.sheetsCount ?? 0),
    coverImageUrl: item.coverImageUrl && item.coverImageUrl.length > 0 ? item.coverImageUrl : undefined,
    songIds
  };
}

function extractSchemaListPayload(payload: unknown): SchemaListItem[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => (isSchemaListItem(item) ? finalizeSchemaListItem(item) : normalizeSchemaListItem(item)));
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const envelope = payload as { schemas?: unknown };
  if (!Array.isArray(envelope.schemas)) {
    return [];
  }

  return envelope.schemas
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => (isSchemaListItem(item) ? finalizeSchemaListItem(item) : normalizeSchemaListItem(item)));
}

async function getSchemasFromFunctions(userId: string): Promise<SchemaListItem[] | null> {
  if (!functionsBaseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${functionsBaseUrl}/schemas?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return extractSchemaListPayload(payload);
  } catch {
    return null;
  }
}

export async function getUserSchemas(userId: string): Promise<SchemaListItem[]> {
  const remote = await getSchemasFromFunctions(userId);
  if (remote) {
    return remote.filter((item) => item.ownerUserId === userId).map(finalizeSchemaListItem);
  }

  return schemaListMock.filter((item) => item.ownerUserId === userId).map(finalizeSchemaListItem);
}

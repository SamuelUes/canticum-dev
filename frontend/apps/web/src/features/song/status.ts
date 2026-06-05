export const SONG_STATUS_OPTIONS = ['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED'] as const;

export type SongEditorialStatus = (typeof SONG_STATUS_OPTIONS)[number];

export const SONG_STATUS_LABELS: Record<SongEditorialStatus, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazada',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada'
};

export const SONG_STATUS_HELPERS: Record<SongEditorialStatus, string> = {
  DRAFT: 'Aún no visible',
  IN_REVIEW: 'En proceso editorial',
  REJECTED: 'No aprobada',
  APPROVED: 'Lista para publicación',
  PUBLISHED: 'Visible para todos'
};

export function normalizeSongStatus(rawStatus: unknown): SongEditorialStatus {
  const normalized = typeof rawStatus === 'string'
    ? rawStatus
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    : '';

  if (normalized === 'BORRADOR' || normalized === 'DRAFT') return 'DRAFT';
  if (normalized === 'IN_REVIEW') return 'IN_REVIEW';
  if (normalized === 'EN REVISION' || normalized === 'REVIEW' || normalized === 'REVISION') return 'IN_REVIEW';
  if (normalized === 'REJECTED') return 'REJECTED';
  if (normalized === 'RECHAZADA' || normalized === 'RECHAZADO') return 'REJECTED';
  if (normalized === 'APPROVED') return 'APPROVED';
  if (normalized === 'APROBADA' || normalized === 'APROBADO') return 'APPROVED';
  if (normalized === 'PUBLISHED') return 'PUBLISHED';
  if (normalized === 'PUBLICADA' || normalized === 'PUBLICADO') return 'PUBLISHED';
  return 'DRAFT';
}

export function getSongStatusLabel(rawStatus: unknown): string {
  return SONG_STATUS_LABELS[normalizeSongStatus(rawStatus)];
}

export function isSongEditorialStatus(value: string): value is SongEditorialStatus {
  return value === 'DRAFT' || value === 'IN_REVIEW' || value === 'REJECTED' || value === 'APPROVED' || value === 'PUBLISHED';
}

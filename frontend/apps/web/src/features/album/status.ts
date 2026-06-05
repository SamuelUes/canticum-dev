export const ALBUM_STATUS_OPTIONS = ['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED'] as const;

export type AlbumEditorialStatus = (typeof ALBUM_STATUS_OPTIONS)[number];

export const ALBUM_STATUS_LABELS: Record<AlbumEditorialStatus, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazado',
  APPROVED: 'Aprobado',
  PUBLISHED: 'Publicado'
};

export const ALBUM_STATUS_HELPERS: Record<AlbumEditorialStatus, string> = {
  DRAFT: 'Aún no visible',
  IN_REVIEW: 'En proceso editorial',
  REJECTED: 'No aprobado',
  APPROVED: 'Listo para publicación',
  PUBLISHED: 'Visible para todos'
};

export function normalizeAlbumStatus(rawStatus: unknown): AlbumEditorialStatus {
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
  if (normalized === 'RECHAZADO') return 'REJECTED';
  if (normalized === 'APPROVED') return 'APPROVED';
  if (normalized === 'APROBADO') return 'APPROVED';
  if (normalized === 'PUBLISHED') return 'PUBLISHED';
  if (normalized === 'PUBLICADO') return 'PUBLISHED';
  return 'DRAFT';
}

export function getAlbumStatusLabel(rawStatus: unknown): string {
  return ALBUM_STATUS_LABELS[normalizeAlbumStatus(rawStatus)];
}

export function isAlbumEditorialStatus(value: string): value is AlbumEditorialStatus {
  return value === 'DRAFT' || value === 'IN_REVIEW' || value === 'REJECTED' || value === 'APPROVED' || value === 'PUBLISHED';
}

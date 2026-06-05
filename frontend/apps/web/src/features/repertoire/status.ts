export const REPERTOIRE_STATUS_OPTIONS = ['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'PUBLISHED'] as const;

export type RepertoireStatusKey = (typeof REPERTOIRE_STATUS_OPTIONS)[number];

export const REPERTOIRE_STATUS_LABELS: Record<RepertoireStatusKey, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazado',
  APPROVED: 'Aprobado',
  PUBLISHED: 'Publicado'
};

export const REPERTOIRE_STATUS_HELPERS: Record<RepertoireStatusKey, string> = {
  DRAFT: 'Aún no visible',
  IN_REVIEW: 'En proceso editorial',
  REJECTED: 'No aprobado',
  APPROVED: 'Listo para publicar',
  PUBLISHED: 'Visible para todos'
};

export function normalizeRepertoireStatus(rawStatus: unknown): RepertoireStatusKey {
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

export function getRepertoireStatusLabel(rawStatus: unknown): string {
  return REPERTOIRE_STATUS_LABELS[normalizeRepertoireStatus(rawStatus)];
}

import { DomainError } from './errors';

export const PLACEMENT_PAGE_SIZE = 9;

export interface PlacementListQuery {
  page: number;
  pageSize: number;
  search: string;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new DomainError('INVALID_RANGE', 'Invalid pagination value');
  }
  return parsed;
}

export function validatePlacementListQuery(value: {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
}): PlacementListQuery {
  if (value.search !== undefined && typeof value.search !== 'string') {
    throw new DomainError('INVALID_RANGE', 'Invalid search');
  }
  const search = (value.search ?? '').trim();
  if (search.length > 120) throw new DomainError('INVALID_RANGE', 'Search is too long');
  return {
    page: positiveInteger(value.page, 1, 10_000),
    pageSize: positiveInteger(value.pageSize, PLACEMENT_PAGE_SIZE, 100),
    search,
  };
}

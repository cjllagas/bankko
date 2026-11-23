import { E } from './api-error';
import { OptInt, OptString } from './validators';

// Common ?page=&limit=&sort= query parameters (Lab 05 pagination envelope).
export class PageQueryDto {
  @OptInt(1, 999999999) page?: number;
  @OptInt(1, 100) limit?: number;
  @OptString(40) sort?: string;
}

export function paging(q: PageQueryDto) {
  const page = q.page ?? 1, limit = q.limit ?? 10;
  return { page, limit, skip: (page - 1) * limit };
}

/** sort=-field -> { prop, dir } using a whitelist, so raw input never reaches the query. */
export function sorting(q: PageQueryDto, allowed: Record<string, string>, def: string) {
  const raw = q.sort || def;
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  if (!Object.prototype.hasOwnProperty.call(allowed, field)) {
    throw E.badRequest('Invalid query parameter.', [`sort must be one of: ${Object.keys(allowed).join(', ')} (prefix - for descending).`]);
  }
  return { prop: allowed[field], dir: (desc ? 'DESC' : 'ASC') as 'ASC' | 'DESC' };
}

export const envelope = <T, R>(rows: T[], mapper: (r: T) => R, p: { page: number; limit: number }, total: number) =>
  ({ data: rows.map(mapper), page: p.page, limit: p.limit, totalItems: Number(total) });

/** A path id such as /accounts/101. A malformed id cannot exist, so it is 404. */
export function idParam(value: string, what: string): number {
  if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > 2147483647) {
    throw E.notFound(`${what} not found.`, [`No ${what.toLowerCase()} exists with ID ${String(value).slice(0, 20)}.`]);
  }
  return Number(value);
}

/** dateFrom/dateTo (YYYY-MM-DD) -> inclusive UTC bounds. */
export function dateBounds(from?: string, to?: string) {
  if (from && to && from > to) throw E.badRequest('Invalid date range.', ['dateFrom must not be later than dateTo.']);
  return {
    from: from ? new Date(`${from}T00:00:00Z`) : undefined,
    to: to ? new Date(`${to}T23:59:59Z`) : undefined,
  };
}

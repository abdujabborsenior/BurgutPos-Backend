export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return { items, total, page, limit };
}

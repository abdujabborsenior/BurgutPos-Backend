/**
 * SQL fragment: `column` falls inside the inclusive local-date range
 * [$from, $to] of time zone $tz (parameter indexes are 1-based).
 */
export function inLocalDateRange(
  column: string,
  fromIndex: number,
  toIndex: number,
  tzIndex: number,
): string {
  return `${column} >= ($${fromIndex}::date)::timestamp AT TIME ZONE $${tzIndex}
      AND ${column} < ($${toIndex}::date + 1)::timestamp AT TIME ZONE $${tzIndex}`;
}

/**
 * SQL fragment: `column` falls inside [$from, $until) where both bounds are
 * local wall-clock times ("YYYY-MM-DDTHH:mm") of time zone $tz.
 */
export function inLocalRange(
  column: string,
  fromIndex: number,
  untilIndex: number,
  tzIndex: number,
): string {
  return `${column} >= ($${fromIndex}::timestamp AT TIME ZONE $${tzIndex})
      AND ${column} < ($${untilIndex}::timestamp AT TIME ZONE $${tzIndex})`;
}

/**
 * Sales of an order (alias `o`) that carry the service charge — the base of
 * the waiter's share: no service charge itself, no takeaway/delivery/counter
 * orders. The single definition used by every report and the dashboard.
 */
export const SERVICE_BASE_SQL = `CASE WHEN o.service_percent > 0 THEN o.subtotal - o.discount_amount ELSE 0 END`;

/** Waiter's share of a paid order (alias `o`) at the rate snapshotted on payment. */
export const WAITER_SHARE_SQL = `ROUND((${SERVICE_BASE_SQL}) * o.waiter_percent / 100, 2)`;

export const num = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);

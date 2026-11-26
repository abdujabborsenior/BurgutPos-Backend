const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date (YYYY-MM-DD) of `instant` in the given IANA time zone. */
export function dateInTimeZone(instant: Date, timeZone: string): string {
  // en-CA renders dates as YYYY-MM-DD; this is a machine key, not UI text.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function todayInTimeZone(timeZone: string): string {
  return dateInTimeZone(new Date(), timeZone);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Adds whole days to a YYYY-MM-DD key (calendar arithmetic, no time zone). */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`).getTime();
  const to = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** "11.11.2026 17:16" in the given time zone (exports and printed documents). */
export function formatDateTimeInZone(
  value: Date | string | null | undefined,
  timeZone: string,
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
}

/** Local wall-clock minute "YYYY-MM-DDTHH:mm" of an instant (period bounds). */
export function minuteInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** "11.11.2026" from a YYYY-MM-DD key. */
export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}.${month}.${year}`;
}

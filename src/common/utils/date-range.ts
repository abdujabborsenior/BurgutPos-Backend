import { BadRequestException } from '@nestjs/common';
import { isDateKey, todayInTimeZone } from './dates';

/**
 * A period bound: a calendar day ("2026-11-11") or a local wall-clock minute
 * of the business time zone ("2026-11-11T08:30"; seconds are ignored).
 */
export const DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
export const DATE_OR_DATE_TIME_MESSAGE =
  'Дата должна быть в формате ГГГГ-ММ-ДД или ГГГГ-ММ-ДДTЧЧ:ММ';

const BOUND_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?$/;
const MINUTE_MS = 60_000;

/** Local wall-clock minute "YYYY-MM-DDTHH:mm" of the business time zone. */
export type WallTime = string;

export interface ResolvedRange {
  /** Inclusive start. */
  from: WallTime;
  /** Inclusive last minute — what the user picked ("…T23:59"). */
  to: WallTime;
  /** Exclusive end used by queries: `to` + 1 minute. */
  until: WallTime;
  /** Calendar days the period touches (per-day series). */
  fromDate: string;
  toDate: string;
}

/**
 * Wall-clock minutes since the epoch. Pure calendar arithmetic in UTC: the
 * value is never an instant — PostgreSQL converts it with `AT TIME ZONE`.
 * A bare day starts at 00:00 or, as an end bound, covers it up to 23:59.
 */
function toMinutes(value: string, edge: 'start' | 'end', label: string) {
  const match = BOUND_RE.exec(value);
  if (!match || !isDateKey(match[1])) {
    throw new BadRequestException(`Некорректная дата ${label}`);
  }
  const [year, month, day] = match[1].split('-').map(Number);
  let hours = edge === 'start' ? 0 : 23;
  let minutes = edge === 'start' ? 0 : 59;
  if (match[2] !== undefined) {
    hours = Number(match[2]);
    minutes = Number(match[3]);
    if (hours > 23 || minutes > 59) {
      throw new BadRequestException(`Некорректное время ${label}`);
    }
  }
  return Date.UTC(year, month - 1, day, hours, minutes) / MINUTE_MS;
}

const toWallTime = (minutes: number): WallTime =>
  new Date(minutes * MINUTE_MS).toISOString().slice(0, 16);

const dayOf = (value: string) => value.slice(0, 10);

/**
 * Validates a report period. Missing bounds default to "today"; a lone bound
 * means the rest of that day (from) or the day up to it (to).
 */
export function resolveDateRange(
  input: { from?: string; to?: string },
  timeZone: string,
  maxDays = 366,
): ResolvedRange {
  const today = todayInTimeZone(timeZone);
  const start = toMinutes(
    input.from ?? (input.to ? dayOf(input.to) : today),
    'start',
    'начала',
  );
  const end = toMinutes(
    input.to ?? (input.from ? dayOf(input.from) : today),
    'end',
    'окончания',
  );
  if (start > end) {
    throw new BadRequestException(
      'Дата начала не может быть позже даты окончания',
    );
  }
  if (end + 1 - start > maxDays * 24 * 60) {
    throw new BadRequestException(`Период не может превышать ${maxDays} дней`);
  }
  const from = toWallTime(start);
  const to = toWallTime(end);
  return {
    from,
    to,
    until: toWallTime(end + 1),
    fromDate: dayOf(from),
    toDate: dayOf(to),
  };
}

/** Optional list-filter bounds (either side may be open): [from, until). */
export function optionalDateRange(input: { from?: string; to?: string }): {
  from?: WallTime;
  until?: WallTime;
} {
  const start =
    input.from === undefined
      ? undefined
      : toMinutes(input.from, 'start', 'начала');
  const end =
    input.to === undefined
      ? undefined
      : toMinutes(input.to, 'end', 'окончания');
  if (start !== undefined && end !== undefined && start > end) {
    throw new BadRequestException(
      'Дата начала не может быть позже даты окончания',
    );
  }
  return {
    from: start === undefined ? undefined : toWallTime(start),
    until: end === undefined ? undefined : toWallTime(end + 1),
  };
}

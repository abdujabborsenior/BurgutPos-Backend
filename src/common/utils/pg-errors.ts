import { QueryFailedError } from 'typeorm';

interface PgDriverError {
  code?: string;
  constraint?: string;
  detail?: string;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';
export const PG_NOT_NULL_VIOLATION = '23502';
export const PG_INVALID_TEXT = '22P02';
export const PG_NUMERIC_OVERFLOW = '22003';
export const PG_SERIALIZATION_FAILURE = '40001';
export const PG_DEADLOCK = '40P01';
export const PG_LOCK_NOT_AVAILABLE = '55P03';

export function pgError(error: unknown): PgDriverError | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driver = (error as QueryFailedError & { driverError?: PgDriverError })
    .driverError;
  return driver ?? (error as unknown as PgDriverError);
}

export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const pg = pgError(error);
  if (!pg || pg.code !== PG_UNIQUE_VIOLATION) return false;
  return constraint ? pg.constraint === constraint : true;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === PG_FOREIGN_KEY_VIOLATION;
}

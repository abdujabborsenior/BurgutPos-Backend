import type { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL `numeric` arrives from `pg` as a string to avoid precision loss.
 * Amounts in this domain stay far below 2^53, so exposing them as JS numbers
 * is safe; arithmetic itself is done with decimal.js (see common/utils/money).
 */
export const decimalTransformer: ValueTransformer = {
  to(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return value.toString();
    return value;
  },
  from(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    return Number(value);
  },
};

export const moneyColumn = {
  type: 'numeric' as const,
  precision: 14,
  scale: 2,
  default: 0,
  transformer: decimalTransformer,
};

export const quantityColumn = {
  type: 'numeric' as const,
  precision: 14,
  scale: 3,
  default: 0,
  transformer: decimalTransformer,
};

export const percentColumn = {
  type: 'numeric' as const,
  precision: 5,
  scale: 2,
  default: 0,
  transformer: decimalTransformer,
};

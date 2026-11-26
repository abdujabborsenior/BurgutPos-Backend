import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = Decimal.Value;

/** Rounds a monetary value to 2 decimals (half-up). */
export const money = (value: Numeric): number =>
  new Decimal(value).toDecimalPlaces(2).toNumber();

/** Rounds a quantity to 3 decimals (half-up). */
export const qty = (value: Numeric): number =>
  new Decimal(value).toDecimalPlaces(3).toNumber();

export const sumMoney = (values: Numeric[]): number =>
  money(values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0)));

export const sumQty = (values: Numeric[]): number =>
  qty(values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0)));

export const mulMoney = (a: Numeric, b: Numeric): number =>
  money(new Decimal(a).times(b));

export const subMoney = (a: Numeric, b: Numeric): number =>
  money(new Decimal(a).minus(b));

export const addMoney = (a: Numeric, b: Numeric): number =>
  money(new Decimal(a).plus(b));

export const subQty = (a: Numeric, b: Numeric): number =>
  qty(new Decimal(a).minus(b));

export const addQty = (a: Numeric, b: Numeric): number =>
  qty(new Decimal(a).plus(b));

export const mulQty = (a: Numeric, b: Numeric): number =>
  qty(new Decimal(a).times(b));

/** `percent` % of `base`, rounded to money precision. */
export const percentOf = (base: Numeric, percent: Numeric): number =>
  money(new Decimal(base).times(percent).div(100));

export const isWhole = (value: Numeric): boolean =>
  new Decimal(value).isInteger();

export const compare = (a: Numeric, b: Numeric): number =>
  new Decimal(a).comparedTo(b);

import { Transform } from 'class-transformer';

/** Trims string input; collapses repeated whitespace. Empty string → undefined. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length ? cleaned : undefined;
  });

/** Trims multi-line text, keeping line breaks. Empty string → null. */
export const TrimMultiline = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(/[ \t]+\n/g, '\n').trim();
    return cleaned.length ? cleaned : null;
  });

/** Parses "true"/"false" query strings into booleans. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  });

/** Upper-cases a string value (used for sort direction). */
export const ToUpper = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  );

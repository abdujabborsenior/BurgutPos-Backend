/** Escapes LIKE wildcards so user input is matched literally. */
export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Trims and collapses inner whitespace; returns undefined for empty input. */
export function cleanText(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned : undefined;
}

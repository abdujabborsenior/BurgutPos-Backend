import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Refresh token wire format: "<sessionId>.<secret>". Only sha256(secret) is stored. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function composeRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRefreshToken(
  token: unknown,
): { sessionId: string; secret: string } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const sessionId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!UUID_RE.test(sessionId) || secret.length < 20) return null;
  return { sessionId, secret };
}

export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The address a client came from, spelled the same way everywhere: an IPv4
 * carried over IPv6 ("::ffff:10.0.0.5") is unwrapped, so the login log and the
 * list of connected users never show two spellings of one machine.
 */
export function normalizeIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const unwrapped = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return unwrapped.slice(0, 45) || null;
}

/**
 * Address of a socket handshake. The forwarded header is read ONLY when the
 * app is configured to sit behind a proxy — otherwise any client could claim
 * to come from any address just by sending a header.
 */
export function handshakeIp(
  handshake: {
    address?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  trustProxy: boolean,
): string | null {
  const forwarded = trustProxy ? handshake.headers['x-forwarded-for'] : null;
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return normalizeIp(first?.split(',')[0] ?? handshake.address);
}

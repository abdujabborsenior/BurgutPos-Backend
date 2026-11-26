import { compare, hash } from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> =>
  hash(plain, ROUNDS);

export const verifyPassword = (
  plain: string,
  hashed: string,
): Promise<boolean> => compare(plain, hashed);

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same CPU time as a real check when the login does not exist,
 * so response timing does not reveal which logins are valid.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= hash('burgut-timing-equaliser', ROUNDS);
  await compare(plain, await dummyHash);
  return false;
}

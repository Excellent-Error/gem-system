import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384, r = 8, p = 1, KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p }).toString('hex');
  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, n, rr, pp, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const calc = scryptSync(String(password), salt, KEYLEN, { N: Number(n), r: Number(rr), p: Number(pp) });
    const expected = Buffer.from(hash, 'hex');
    return calc.length === expected.length && timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

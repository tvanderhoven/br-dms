/**
 * Passwort-Hashing mit Node.js built-in scrypt.
 * Kein zusätzliches Paket nötig.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SALT_LEN = 16;
const KEY_LEN  = 64;

/** Erzeugt einen Hash der Form "salt:hash" */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

/** Prüft ein Passwort gegen einen gespeicherten Hash */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const incoming = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  // timingSafeEqual wirft bei ungleicher Länge (z.B. Dummy-Hash beim Login
  // eines unbekannten Benutzers) → als "falsch" werten statt HTTP 500
  if (expected.length !== incoming.length) return false;
  return timingSafeEqual(expected, incoming);
}

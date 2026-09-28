/**
 * Player PINs and the "this phone is me" cookie (Roadmap Phase 3).
 *
 * A 4-digit PIN is shown once at registration. Only a salted scrypt hash is
 * stored (live_session_players.pin_hash — not readable with the anon key).
 * 10,000 PINs is a small space, so the real protection is the rate limit:
 * 5 tries per name per 10 minutes (live_pin_attempts).
 *
 * Server-only (node:crypto).
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

export const PIN_TRIES = 5;
export const PIN_WINDOW_MIN = 10;

export const generatePin = () => String(randomInt(0, 10_000)).padStart(4, '0');

export const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !validPin(pin)) return false;
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, 'hex');
  const got = scryptSync(pin, Buffer.from(saltHex, 'hex'), want.length);
  return timingSafeEqual(got, want);
}

/** One cookie per session, so a phone can be "me" in this week's session only. */
export const cookieName = (sessionId: string) => `tss_live_${sessionId.replace(/-/g, '')}`;

/** Case- and space-insensitive name key for rate limiting and lookup. */
export const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Cookie lifetime. Refreshed on every visit while the session is running, so
 * it lasts about 12 hours past the player's last look at the night.
 */
export const COOKIE_HOURS = 12;

export function playerCookie(sessionId: string, playerId: string, secure: boolean) {
  return {
    name: cookieName(sessionId),
    value: playerId,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: COOKIE_HOURS * 3600,
  };
}

/**
 * Server-side config building. A session's config is always DEFAULT_CONFIG
 * plus the admin overrides listed here — never a config object sent by a
 * browser. Session 88 ran on stale weights (per100Gap 0.5, no strong/beginner
 * costs) because the create route stored whatever the client posted.
 *
 * Pure, so it is testable without a database (config.test.ts).
 */
import { CONFIG_VERSION, Config, DEFAULT_CONFIG, Level } from './engine';

export { CONFIG_VERSION };

/**
 * Keys the server owns inside the config jsonb. A tuning save must never drop
 * them, and a browser may never set them.
 */
export const SERVER_KEYS = ['registrationOpen', 'withdrawn', 'finalRound', 'blockedMoves', 'dismissed'] as const;

export function serverKeys(cfg: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SERVER_KEYS) if (cfg?.[k] !== undefined) out[k] = cfg[k];
  return out;
}

const LEVELS: Level[] = ['beginner', 'standard', 'intermediate', 'strong'];
const num = (x: unknown, lo: number, hi: number) =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined;
const int = (x: unknown, lo: number, hi: number) => {
  const n = num(x, lo, hi); return n !== undefined && Number.isInteger(n) ? n : undefined;
};
const nullableInt = (x: unknown, lo: number, hi: number) => (x === null ? null : int(x, lo, hi));

/**
 * Build a config from the defaults and the overrides an admin may set. Anything
 * else in `input` is ignored; a value of the wrong type or out of range is
 * rejected with a message naming it.
 */
export function buildConfig(input: any = {}): Config {
  const d = DEFAULT_CONFIG;
  const c: Config = structuredClone(d);
  const bad = (what: string) => { throw new Error(`invalid setting: ${what}`); };
  const r = input.rating ?? {}, rot = input.rotation ?? {}, cost = rot.cost ?? {}, lv = input.levels ?? {};

  if (input.courts !== undefined || rot.courts !== undefined) {
    c.rotation.courts = int(input.courts ?? rot.courts, 1, 12) ?? bad('courts (1–12)');
  }
  if (r.kSchedule !== undefined) {
    if (!Array.isArray(r.kSchedule) || !r.kSchedule.length || r.kSchedule.length > 10) bad('K schedule');
    c.rating.kSchedule = r.kSchedule.map((k: unknown) => num(k, 1, 1000) ?? bad('K schedule'));
  }
  if (r.start !== undefined) {
    for (const l of LEVELS) if (r.start[l] !== undefined) c.rating.start[l] = num(r.start[l], 100, 3000) ?? bad(`start rating for ${l}`);
    const s = LEVELS.map((l) => c.rating.start[l]);
    if (s.some((x, i) => i > 0 && x <= s[i - 1])) bad('start ratings must rise beginner → strong');
  }
  if (r.clip !== undefined) {
    const lo = num(r.clip?.[0], 0, 0.5), hi = num(r.clip?.[1], 0.5, 1);
    if (lo === undefined || hi === undefined) bad('expected-share clip');
    c.rating.clip = [lo!, hi!];
  }
  if (rot.movementCap !== undefined) c.rotation.movementCap = nullableInt(rot.movementCap, 0, 12) ?? bad('movement cap');
  if (rot.beginnerCourts !== undefined) {
    if (!Array.isArray(rot.beginnerCourts)) bad('beginner courts');
    c.rotation.beginnerCourts = rot.beginnerCourts.map((x: unknown) => int(x, 1, 12) ?? bad('beginner courts'));
  }
  for (const k of ['repeatPartner', 'repeatOpponent', 'per100Gap', 'strongWithBeginner', 'strongVsBeginner'] as const) {
    if (cost[k] !== undefined) c.rotation.cost[k] = num(cost[k], 0, 100) ?? bad(`cost ${k}`);
  }
  if (rot.maxCourtSpread !== undefined) c.rotation.maxCourtSpread = num(rot.maxCourtSpread, 0, 2000) ?? bad('max court spread');
  if (rot.maxSwapDistance !== undefined) c.rotation.maxSwapDistance = nullableInt(rot.maxSwapDistance, 0, 12) ?? bad('max swap distance');
  if (rot.maxSwapGapIncrease !== undefined) {
    c.rotation.maxSwapGapIncrease = rot.maxSwapGapIncrease === null ? null : num(rot.maxSwapGapIncrease, 0, 1000) ?? bad('max swap gap increase');
  }
  if (rot.loneBeginnerPairing !== undefined) {
    if (typeof rot.loneBeginnerPairing !== 'boolean') bad('lone-beginner pairing');
    c.rotation.loneBeginnerPairing = rot.loneBeginnerPairing;
  }
  if (lv.autoApply !== undefined) {
    if (typeof lv.autoApply !== 'boolean') bad('auto-apply');
    c.levels.autoApply = lv.autoApply;
  }
  if (lv.minGames !== undefined) c.levels.minGames = int(lv.minGames, 1, 50) ?? bad('level review: minimum games');
  if (lv.roundsInBand !== undefined) c.levels.roundsInBand = int(lv.roundsInBand, 1, 10) ?? bad('level review: rounds in band');
  if (lv.hysteresis !== undefined) c.levels.hysteresis = num(lv.hysteresis, 0, 200) ?? bad('level review: margin inside band');
  if (lv.mismatchMargin !== undefined) c.levels.mismatchMargin = int(lv.mismatchMargin, 1, 30) ?? bad('mismatch margin');
  if (lv.mismatchShare !== undefined) c.levels.mismatchShare = num(lv.mismatchShare, 0.01, 0.5) ?? bad('mismatch share');
  return c;
}

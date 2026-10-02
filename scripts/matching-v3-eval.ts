/**
 * v2 vs v3 matching on real sessions (fixtures/session-88/89/90.json).
 *
 *   npx tsx scripts/matching-v3-eval.ts
 *
 * 1. Ratings: how well each rating setting predicted every game before it was played
 *    (mean |expected share − actual share|, in points of share).
 * 2. Draws: every round re-drawn from the real state before it (same people, same
 *    sit-outs, same history) under v3, then the real v2 draw and the v3 draw are
 *    judged with hindsight ratings (end-of-night ratings from the real scores) and
 *    level checks. Lower is better everywhere.
 */
import {
  loadFixture, stateBefore, fixtureConfig, fixtureRounds, drawPool,
} from '../lib/live-session/fixtures';
import { DEFAULT_CONFIG, replay, solveRound, expectedShare, teamRating, tier } from '../lib/live-session/engine';
import type { Match, Player } from '../lib/live-session/engine';

const FIXTURES = ['session-88.json', 'session-89.json', 'session-90.json'];
const v3 = (c: any) => ({
  ...c,
  rating: { ...c.rating, ...DEFAULT_CONFIG.rating, start: c.rating.start },
  rotation: { ...c.rotation, levelFirst: true, evenBoundary: true, sameLevelSwaps: true,
    cost: { ...c.rotation.cost, levelGap: DEFAULT_CONFIG.rotation.cost.levelGap, widePair: DEFAULT_CONFIG.rotation.cost.widePair } },
});

// 1. Rating prediction error
let e2 = 0, e3 = 0, n = 0;
for (const name of FIXTURES) {
  const f = loadFixture(name);
  const s = stateBefore(f, Math.max(...f.results.map((r) => r.round)) + 1);
  const g2 = replay(s).games, g3 = replay({ ...s, config: v3(s.config) }).games;
  g2.forEach((g, i) => { e2 += Math.abs(g.expectedA - g.actualA); e3 += Math.abs(g3[i].expectedA - g3[i].actualA); n++; });
}
console.log(`Rating prediction error over ${n} games: v2 ${(e2 / n * 100).toFixed(2)}  v3 ${(e3 / n * 100).toFixed(2)} (points of share)\n`);

// 2. Draw quality
type Tot = { dev: number; lopsided: number; threeOne: number; uneven: number; wide: number; intBeg: number; n: number };
const zero = (): Tot => ({ dev: 0, lopsided: 0, threeOne: 0, uneven: 0, wide: 0, intBeg: 0, n: 0 });
function judge(ms: Match[], P: Record<string, Player>, H: Record<string, number>, cfg: any, t: Tot) {
  for (const m of ms) {
    const ids = [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b];
    const e = expectedShare(teamRating(H[ids[0]], H[ids[1]]), teamRating(H[ids[2]], H[ids[3]]), cfg);
    t.dev += Math.abs(e - 0.5); if (Math.abs(e - 0.5) >= 0.1) t.lopsided++;
    const l = ids.map((id) => tier(P[id])); const top = Math.max(...l);
    if (l.filter((x) => x === top).length === 3 && l.some((x) => x < top)) t.threeOne++;
    if (l[0] + l[1] !== l[2] + l[3]) t.uneven++;
    t.wide += +(Math.abs(l[0] - l[1]) >= 2) + +(Math.abs(l[2] - l[3]) >= 2);
    if (l.includes(0) && l.includes(2)) t.intBeg++;
    t.n++;
  }
}
const row = (k: string, t: Tot) => `  ${k}  imbalance ${(t.dev / t.n * 100).toFixed(1)}%  60/40+ ${t.lopsided}/${t.n}  3+1 courts ${t.threeOne}  uneven-level teams ${t.uneven}  wide pairs ${t.wide}  int+beginner courts ${t.intBeg}`;
const all = { v2: zero(), v3: zero() };
for (const name of FIXTURES) {
  const f = loadFixture(name);
  const last = Math.max(...f.results.map((r) => r.round));
  const end = stateBefore(f, last + 1);
  const H = Object.fromEntries(Object.values(replay({ ...end, config: v3(end.config) }).players).map((p) => [p.id, p.rating]));
  const t = { v2: zero(), v3: zero() };
  for (const r of fixtureRounds(f).filter((x) => x.index <= last && x.matches.length > 1)) {
    const st = stateBefore(f, r.index, fixtureConfig(f));
    const pool = drawPool(f, st, r.index);
    const draw = solveRound(pool, st.rounds, v3(st.config).rotation, st.seed, r.sitOuts).round.matches;
    judge(r.matches, pool, H, v3(st.config).rating, t.v2);
    judge(draw, pool, H, v3(st.config).rating, t.v3);
  }
  for (const k of ['v2', 'v3'] as const) for (const x of Object.keys(t[k]) as (keyof Tot)[]) all[k][x] += t[k][x];
  console.log(`${name}\n${row('v2', t.v2)}\n${row('v3', t.v3)}`);
}
console.log(`\nAll three\n${row('v2', all.v2)}\n${row('v3', all.v3)}`);

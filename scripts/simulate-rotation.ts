/**
 * Rotation + level-review simulation. Run:
 *   npx tsx scripts/simulate-rotation.ts
 *
 * Players have a hidden true skill. Scores come from true skill plus noise,
 * so the engine only ever sees what a real session would: results. Every
 * metric below is measured against TRUE skill, not the engine's ratings.
 *
 *  1. Swap limits (Session 89 fix 1): 28 players, 4 courts, 9 rounds, before
 *     (limits off = the 25 Sep engine) vs after (defaults).
 *  2. Level review (fix 4): the same, but 20% of players picked a level one
 *     step off their true one. Review off vs on.
 */
import {
  createSession, nextRound, recordScore, reviewLevels, changeLevel, courtViolates, bandOf,
  expectedShare, DEFAULT_CONFIG, Config, Level, Session,
} from '../lib/live-session/engine';

const LEVELS: Level[] = ['beginner', 'standard', 'intermediate', 'strong'];
const MIX: Record<Level, number> = { strong: 5, intermediate: 9, standard: 10, beginner: 4 }; // Session 89

function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

interface Metrics { games: number; gap: number; margin: number; partnerRep: number; oppRep: number; breaches: number; moves: number; right: number; wrong: number; mislabelled: number; fixedByEnd: number }

export function run(cfg: Config, seed: number, mislabel: number, rounds = 9): Metrics {
  const r = prng(seed);
  const truth: Record<string, number> = {};
  const trueLevel: Record<string, Level> = {};
  const roster: { id: string; name: string; level: Level }[] = [];
  let i = 0;
  for (const lvl of LEVELS) for (let k = 0; k < MIX[lvl]; k++) {
    const id = `p${i++}`;
    truth[id] = cfg.rating.start[lvl] + gauss(r) * 35;
    // "True level" = the band their true skill falls in, not the level they
    // were generated from: a standard whose skill is 1030 plays like an intermediate.
    trueLevel[id] = bandOf(truth[id], cfg.rating.start);
    let picked = trueLevel[id];
    if (r() < mislabel) {
      const li = LEVELS.indexOf(picked);
      picked = LEVELS[li === 0 ? 1 : li === 3 ? 2 : li + (r() < 0.5 ? -1 : 1)];
    }
    roster.push({ id, name: id, level: picked });
  }
  let s: Session = createSession(roster, cfg, seed);
  const m: Metrics = { games: 0, gap: 0, margin: 0, partnerRep: 0, oppRep: 0, breaches: 0, moves: 0, right: 0, wrong: 0, mislabelled: 0, fixedByEnd: 0 };
  const rank = (l: Level) => LEVELS.indexOf(l);
  const seenP = new Map<string, number>(), seenO = new Map<string, number>();
  const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (let rd = 1; rd <= rounds; rd++) {
    for (const p of reviewLevels(s).filter((x) => x.auto)) {
      const closer = Math.abs(rank(p.to) - rank(trueLevel[p.playerId])) < Math.abs(rank(p.from) - rank(trueLevel[p.playerId]));
      if (closer) m.right++; else m.wrong++;
      s = changeLevel(s, p.playerId, p.to, rd, 'system'); m.moves++;
    }
    s = nextRound(s);
    for (const g of s.rounds[rd - 1].matches) {
      const tA = (truth[g.teamA.a] + truth[g.teamA.b]) / 2, tB = (truth[g.teamB.a] + truth[g.teamB.b]) / 2;
      const share = Math.min(0.95, Math.max(0.05, expectedShare(tA, tB, { ...cfg.rating, clip: [0.05, 0.95] }) + gauss(r) * 0.06));
      const win = share >= 0.5 ? 21 : Math.round(21 * share / (1 - share));
      const lose = share >= 0.5 ? Math.round(21 * (1 - share) / share) : 21;
      s = recordScore(s, rd, g.court, share >= 0.5 ? win : lose, share >= 0.5 ? lose : win);
      m.games++; m.gap += Math.abs(tA - tB); m.margin += Math.abs(win - lose);
      const lv = (id: string) => s.players[id];
      if (courtViolates([g.teamA.a, g.teamA.b, g.teamB.a, g.teamB.b].map(lv))) m.breaches++;
      for (const [a, b] of [[g.teamA.a, g.teamA.b], [g.teamB.a, g.teamB.b]]) {
        const n = seenP.get(k(a, b)) ?? 0; if (n) m.partnerRep++; seenP.set(k(a, b), n + 1);
      }
      for (const a of [g.teamA.a, g.teamA.b]) for (const b of [g.teamB.a, g.teamB.b]) {
        const n = seenO.get(k(a, b)) ?? 0; if (n) m.oppRep++; seenO.set(k(a, b), n + 1);
      }
    }
  }
  for (const p of roster) if (p.level !== trueLevel[p.id]) {
    m.mislabelled++; if (s.players[p.id].level === trueLevel[p.id]) m.fixedByEnd++;
  }
  return m;
}

export function summary(label: string, cfg: Config, mislabel: number, seeds = 200) {
  const t: Metrics = { games: 0, gap: 0, margin: 0, partnerRep: 0, oppRep: 0, breaches: 0, moves: 0, right: 0, wrong: 0, mislabelled: 0, fixedByEnd: 0 };
  for (let sd = 1; sd <= seeds; sd++) {
    const m = run(cfg, sd * 7919, mislabel);
    for (const key of Object.keys(t) as (keyof Metrics)[]) t[key] += m[key];
  }
  const per = (x: number) => (x / seeds).toFixed(2);
  console.log(`${label.padEnd(34)} team gap ${(t.gap / t.games).toFixed(1).padStart(5)}  margin ${(t.margin / t.games).toFixed(2).padStart(5)}` +
    `  partner repeats ${per(t.partnerRep).padStart(5)}  opponent repeats ${per(t.oppRep).padStart(5)}` +
    `  strong+beginner ${t.breaches}` +
    (t.moves ? `  level moves ${per(t.moves)} (${Math.round(100 * t.right / t.moves)}% toward true level)` : '') +
    (t.mislabelled ? `  mislabelled fixed by end ${Math.round(100 * t.fixedByEnd / t.mislabelled)}%` : ''));
}

if (process.env.SIM_LIB !== '1') main();

function main() {
const on = DEFAULT_CONFIG;
const legacySwaps: Config = { ...on, rotation: { ...on.rotation, maxSwapDistance: null, maxSwapGapIncrease: null, loneBeginnerPairing: false } };
const noReview = (c: Config): Config => ({ ...c, levels: { ...c.levels, minGames: 999 } });

console.log(`${200} simulated sessions per line; repeats are per session.\n`);
console.log('1. Swap limits — everyone picked the right level');
summary('   before (25 Sep engine)', noReview(legacySwaps), 0);
summary('   after (swap limits + lone beginner)', noReview(on), 0);
console.log('\n2. Level review — 20% picked a level one step off');
summary('   review off', noReview(on), 0.2);
const auto: Config = { ...on, levels: { ...on.levels, autoApply: true } };
summary('   review on (auto-apply)', auto, 0.2);
summary('   review on, nobody mislabelled', auto, 0);
}

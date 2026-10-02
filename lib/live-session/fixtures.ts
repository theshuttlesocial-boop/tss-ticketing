/**
 * Test-only loader for the replay fixtures in /fixtures (Session 88, 89).
 *
 * Fixtures refer to players by index. This turns them into engine players and
 * results, and rebuilds the state a round was drawn from: the players present,
 * their level at the time, ratings from the games before it, and sit-out
 * counters from the rounds before it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Config, DEFAULT_CONFIG, GameResult, Level, makePlayer, Player, recomputeRatings, Round, Session,
} from './engine';

export interface Fixture {
  session: string;
  config: any;
  players: { i: number; name: string; level: Level }[];
  results: { round: number; court: number; teamA: number[]; teamB: number[]; score: [number, number] }[];
  rounds?: { round: number; sitOuts: number[]; matches: { court: number; teamA: number[]; teamB: number[] }[] }[];
  sitOuts?: Record<string, number[]>;
  levelHistory?: { player: number; from: Level; to: Level; changedBeforeRound: number }[];
  joinedAtRound?: Record<string, number>;
  withdrawn?: { player: number; afterRound: number }[];
  expectedFinalRatings: Record<string, number>;
}

export const loadFixture = (name: string): Fixture =>
  JSON.parse(readFileSync(join(process.cwd(), 'fixtures', name), 'utf8'));

export const pid = (i: number) => `p${String(i).padStart(2, '0')}`;

/** Fixture config merged over the defaults, so keys it predates still exist. */
export function fixtureConfig(f: Fixture): Config {
  const d = DEFAULT_CONFIG as any, c = f.config as any;
  // Settings a fixture predates stay off (v3), so it replays as it was played.
  const offR = 'courtWeight' in c.rating ? {} : { courtWeight: null };
  const offRot = 'levelFirst' in c.rotation ? {} : { levelFirst: false, evenBoundary: false, sameLevelSwaps: false };
  return {
    ...d, ...c,
    rating: { ...d.rating, ...offR, ...c.rating, start: { ...d.rating.start, ...c.rating.start } },
    rotation: { ...d.rotation, ...offRot, ...c.rotation, cost: { ...c.rotation.cost } },
  };
}

export const fixtureResults = (f: Fixture): GameResult[] => f.results.map((g) => ({
  round: g.round, court: g.court,
  teamA: { a: pid(g.teamA[0]), b: pid(g.teamA[1]) },
  teamB: { a: pid(g.teamB[0]), b: pid(g.teamB[1]) },
  scoreA: g.score[0], scoreB: g.score[1],
}));

export function fixtureRounds(f: Fixture): Round[] {
  if (f.rounds) return f.rounds.map((r) => ({
    index: r.round, sitOuts: r.sitOuts.map(pid),
    matches: r.matches.map((m) => ({ court: m.court,
      teamA: { a: pid(m.teamA[0]), b: pid(m.teamA[1]) }, teamB: { a: pid(m.teamB[0]), b: pid(m.teamB[1]) } })),
  }));
  // Session 88 stores only results + sit-outs; rebuild the draw from them.
  const byRound = new Map<number, Round>();
  for (const g of fixtureResults(f)) {
    const r = byRound.get(g.round) ?? { index: g.round, matches: [], sitOuts: (f.sitOuts?.[g.round] ?? []).map(pid) };
    r.matches.push({ court: g.court, teamA: g.teamA, teamB: g.teamB });
    byRound.set(g.round, r);
  }
  return [...byRound.values()].sort((a, b) => a.index - b.index);
}

/** Level a player had when round `round` was drawn. */
export function levelAt(f: Fixture, i: number, round: number): Level {
  let lvl = f.players[i].level;
  for (const h of [...(f.levelHistory ?? [])].filter((h) => h.player === i).reverse()) {
    if (round < h.changedBeforeRound) lvl = h.from;
  }
  return lvl;
}

const joined = (f: Fixture, i: number, round: number) => (f.joinedAtRound?.[i] ?? 1) <= round;

/**
 * The session as it stood just before `round` was drawn, as production saw
 * it: levels at the time (a level edit used to re-rate from game 1), results
 * of earlier rounds, sit-out counters from earlier rounds.
 */
export function stateBefore(f: Fixture, round: number, config = fixtureConfig(f)): Session {
  const rounds = fixtureRounds(f).filter((r) => r.index < round);
  const players: Record<string, Player> = {};
  f.players.forEach((p, i) => {
    if (!joined(f, i, round)) return;
    const sat = rounds.filter((r) => r.sitOuts.includes(pid(i))).length;
    players[pid(i)] = {
      ...makePlayer(pid(i), p.name, levelAt(f, i, round), config.rating),
      sitOuts: sat, satLastRound: rounds.at(-1)?.sitOuts.includes(pid(i)) ?? false,
    };
  });
  const results = fixtureResults(f).filter((g) => g.round < round);
  return recomputeRatings({ config, players, rounds, results, seed: 1 });
}

export const sitOutsOf = (f: Fixture, round: number) =>
  fixtureRounds(f).find((r) => r.index === round)!.sitOuts;

/** Players who were in the hall for `round`: everyone drawn or sitting out in it. */
export function drawPool(f: Fixture, s: Session, round: number): Record<string, Player> {
  const r = fixtureRounds(f).find((x) => x.index === round)!;
  const ids = new Set([...r.sitOuts, ...r.matches.flatMap((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b])]);
  return Object.fromEntries(Object.entries(s.players).filter(([id]) => ids.has(id)));
}

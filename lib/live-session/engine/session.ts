import { applyGame, applyPromotion, makePlayer } from './rating';
import { solveRound } from './rotation';
import { Config, DEFAULT_CONFIG, GameResult, Level, Player, Round } from './types';

/**
 * Immutable session state. Every operation returns a new Session — this is
 * the shape the server function will persist to Supabase (sessions,
 * session_players, games).
 */
export interface Session {
  config: Config;
  players: Record<string, Player>;
  rounds: Round[];
  results: GameResult[];
  seed: number;
}

export function createSession(
  roster: { id: string; name: string; level: Level }[],
  config: Config = DEFAULT_CONFIG,
  seed = 1,
): Session {
  const players: Record<string, Player> = {};
  for (const r of roster) players[r.id] = makePlayer(r.id, r.name, r.level, config.rating);
  return { config, players, rounds: [], results: [], seed };
}

/** Generate the next round's assignments (does not touch ratings). */
export function nextRound(s: Session): Session {
  const { round } = solveRound(s.players, s.rounds, s.config.rotation, s.seed);
  const sit = new Set(round.sitOuts);
  const players: Record<string, Player> = {};
  for (const p of Object.values(s.players)) {
    players[p.id] = sit.has(p.id)
      ? { ...p, sitOuts: p.sitOuts + 1, satLastRound: true }
      : { ...p, satLastRound: false };
  }
  return { ...s, players, rounds: [...s.rounds, round] };
}

/** Record a score for one court in the current round. Re-entering replaces the previous result. */
export function recordScore(s: Session, round: number, court: number, scoreA: number, scoreB: number): Session {
  const r = s.rounds[round - 1];
  if (!r) throw new Error(`round ${round} not generated`);
  const m = r.matches.find((x) => x.court === court);
  if (!m) throw new Error(`court ${court} not in round ${round}`);
  const already = s.results.find((g) => g.round === round && g.court === court);
  const results = already
    ? s.results.map((g) => (g === already ? { ...g, scoreA, scoreB } : g))
    : [...s.results, { round, court, teamA: m.teamA, teamB: m.teamB, scoreA, scoreB }];
  return recomputeRatings({ ...s, results });
}

/**
 * Ratings are a pure function of (roster, results in order). Recomputing from
 * scratch after every entry makes corrections trivial — matching the
 * spreadsheet's "just re-enter the score" behaviour.
 */
export function recomputeRatings(s: Session): Session {
  let players: Record<string, Player> = {};
  for (const p of Object.values(s.players)) {
    players[p.id] = { ...p, rating: s.config.rating.start[p.level], games: 0, history: [],
      beginner: p.level === 'beginner', aboveMedianStreak: 0 };
  }
  const ordered = [...s.results].sort((a, b) => a.round - b.round || a.court - b.court);
  let lastRound = 0;
  for (const g of ordered) {
    if (g.round !== lastRound) {
      if (lastRound > 0) players = applyPromotion(players, s.config.rating);
      lastRound = g.round;
    }
    players = applyGame(players, g, s.config.rating);
  }
  if (lastRound > 0) players = applyPromotion(players, s.config.rating);
  return { ...s, players };
}

/** Override: manually move a player into a slot (admin escape hatch). */
export function overrideSlot(s: Session, round: number, court: number, slot: 'A.a' | 'A.b' | 'B.a' | 'B.b', playerId: string): Session {
  const rounds = s.rounds.map((r) => {
    if (r.index !== round) return r;
    const matches = r.matches.map((m) => {
      if (m.court !== court) return m;
      const [team, pos] = slot.split('.') as ['A' | 'B', 'a' | 'b'];
      const k = team === 'A' ? 'teamA' : 'teamB';
      return { ...m, [k]: { ...m[k], [pos]: playerId } };
    });
    return { ...r, matches };
  });
  return { ...s, rounds };
}

export const currentRound = (s: Session) => s.rounds[s.rounds.length - 1];
export const roundComplete = (s: Session, round: number) =>
  s.rounds[round - 1]?.matches.every((m) => s.results.some((g) => g.round === round && g.court === m.court)) ?? false;

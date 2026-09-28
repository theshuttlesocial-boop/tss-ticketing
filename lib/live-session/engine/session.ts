import { applyGame, expectedShare, actualShare, makePlayer, teamRating } from './rating';
import { solveRound } from './rotation';
import { Config, DEFAULT_CONFIG, GameResult, Level, LevelChange, Player, PlayerId, Round } from './types';

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

export const LEVEL_ORDER: Level[] = ['beginner', 'standard', 'intermediate', 'strong'];
export const levelRank = (l: Level) => LEVEL_ORDER.indexOf(l);

/** What one scored game looked like to the ratings when it was played. */
export interface GameInsight {
  round: number;
  court: number;
  /** Team A's expected and actual point share. */
  expectedA: number;
  actualA: number;
  margin: number;
  /** Ratings going into the game. */
  pre: Record<PlayerId, number>;
}

export interface ReplayResult {
  players: Record<string, Player>;
  games: GameInsight[];
  /** Rating and level of every player after each round with a scored game. */
  afterRound: Map<number, Record<PlayerId, { rating: number; level: Level }>>;
}

/** Apply one level change to a replaying player. */
function adjustForChange(p: Player, c: LevelChange, start: Record<Level, number>): Player {
  let rating = p.rating;
  if (c.adjust !== false) {
    if (levelRank(c.to) > levelRank(c.from)) rating = Math.max(rating, start[c.to]);
    else if (levelRank(c.to) < levelRank(c.from)) rating = Math.min(rating, start[c.to]);
  }
  return { ...p, level: c.to, rating };
}

/**
 * Replay results AND level changes in order.
 *
 * Every player starts on their start level's rating. Before each round, any
 * level change dated to it is applied (and its rating adjustment); then the
 * round's games are rated. So a mid-session level change affects only what
 * comes after it, and the whole table is still a pure function of
 * (start levels, level changes, results) — a corrected score just replays.
 */
export function replay(s: Session): ReplayResult {
  const start = s.config.rating.start;
  let players: Record<string, Player> = {};
  const changes: { id: PlayerId; c: LevelChange }[] = [];
  for (const p of Object.values(s.players)) {
    const sl = p.startLevel ?? p.level;
    players[p.id] = { ...p, level: sl, rating: start[sl], games: 0, history: [], aboveMedianStreak: 0 };
    for (const c of p.levelChanges ?? []) changes.push({ id: p.id, c });
  }
  const ordered = [...s.results].sort((a, b) => a.round - b.round || a.court - b.court);
  const rounds = [...new Set([...ordered.map((g) => g.round), ...changes.map((x) => x.c.beforeRound)])].sort((a, b) => a - b);
  const games: GameInsight[] = [];
  const afterRound: ReplayResult['afterRound'] = new Map();

  for (const r of rounds) {
    for (const { id, c } of changes) if (c.beforeRound === r && players[id]) players[id] = adjustForChange(players[id], c, start);
    const inRound = ordered.filter((g) => g.round === r);
    for (const g of inRound) {
      const ids = [g.teamA.a, g.teamA.b, g.teamB.a, g.teamB.b];
      const pre = Object.fromEntries(ids.map((id) => [id, players[id]?.rating]));
      const eA = expectedShare(teamRating(pre[g.teamA.a], pre[g.teamA.b]), teamRating(pre[g.teamB.a], pre[g.teamB.b]), s.config.rating);
      games.push({ round: g.round, court: g.court, expectedA: eA, actualA: actualShare(g.scoreA, g.scoreB),
        margin: Math.abs(g.scoreA - g.scoreB), pre });
      players = applyGame(players, g, s.config.rating);
    }
    if (inRound.length) {
      afterRound.set(r, Object.fromEntries(Object.values(players).map((p) => [p.id, { rating: p.rating, level: p.level }])));
    }
  }

  // The stored current level is the truth for the draw; the flag follows it.
  for (const p of Object.values(s.players)) {
    players[p.id] = { ...players[p.id], level: p.level, beginner: p.level === 'beginner' };
  }
  return { players, games, afterRound };
}

/**
 * Ratings are a pure function of (roster, level changes, results in order).
 * Recomputing from scratch after every entry makes corrections trivial —
 * matching the spreadsheet's "just re-enter the score" behaviour.
 */
export function recomputeRatings(s: Session): Session {
  return { ...s, players: replay(s).players };
}

/**
 * Change a player's current level from `beforeRound` onwards. Earlier games
 * are untouched; the rating is lifted to (moving up) or capped at (moving
 * down) the new level's starting number, recorded as an event so a replay
 * reproduces it.
 */
export function changeLevel(
  s: Session, id: PlayerId, to: Level, beforeRound: number,
  by: LevelChange['by'], reason?: string, at = new Date().toISOString(),
): Session {
  const p = s.players[id];
  if (!p) throw new Error(`player ${id} not in session`);
  if (p.level === to) return s;
  const c: LevelChange = { from: p.level, to, beforeRound, by, ...(reason ? { reason } : {}), at };
  const players = { ...s.players,
    [id]: { ...p, level: to, beginner: to === 'beginner', levelChanges: [...(p.levelChanges ?? []), c] } };
  return recomputeRatings({ ...s, players });
}

/**
 * "They picked the wrong level at sign-up": change the STARTING level and
 * re-rate from game 1. Deliberately separate from changeLevel, because it
 * rewrites history — every opponent's rating moves too. If there have been
 * no mid-session changes, the current level follows.
 */
export function correctStartLevel(s: Session, id: PlayerId, level: Level): Session {
  const p = s.players[id];
  if (!p) throw new Error(`player ${id} not in session`);
  const followCurrent = !(p.levelChanges ?? []).length;
  const players = { ...s.players, [id]: { ...p, startLevel: level,
    ...(followCurrent ? { level, beginner: level === 'beginner' } : {}) } };
  return recomputeRatings({ ...s, players });
}

/** Whose rating a what-if changes, and by how much (rounded, non-zero only). */
export function ratingImpact(before: Session, after: Session) {
  return Object.values(after.players)
    .map((p) => ({ id: p.id, name: p.name, before: before.players[p.id]?.rating ?? p.rating, after: p.rating }))
    .map((x) => ({ ...x, delta: Math.round(x.after - x.before) }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
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

import { DEFAULT_CONFIG, GameResult, Player, RatingConfig } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Team strength = mean of the two partners' ratings. */
export function teamRating(r1: number, r2: number): number {
  return (r1 + r2) / 2;
}

/** Expected point share for a team: 0.5 + gap/divisor, clipped. */
export function expectedShare(rTeam: number, rOpp: number, cfg: RatingConfig = DEFAULT_CONFIG.rating): number {
  return clamp(0.5 + (rTeam - rOpp) / cfg.divisor, cfg.clip[0], cfg.clip[1]);
}

/** Actual point share. Returns 0.5 for a 0–0 game (no information). */
export function actualShare(scored: number, conceded: number): number {
  const total = scored + conceded;
  return total === 0 ? 0.5 : scored / total;
}

/** K factor for a player's next game, given games already played. */
export function kFor(gamesPlayed: number, cfg: RatingConfig = DEFAULT_CONFIG.rating): number {
  const s = cfg.kSchedule;
  return s[Math.min(gamesPlayed, s.length - 1)];
}

/** Rating delta for one player: K × (A − E). */
export function ratingDelta(
  gamesPlayed: number,
  actual: number,
  expected: number,
  cfg: RatingConfig = DEFAULT_CONFIG.rating,
): number {
  return kFor(gamesPlayed, cfg) * (actual - expected);
}

export interface GameRatingOutcome {
  /** Delta per player id. Partners get the same delta only if they share a K. */
  deltas: Record<string, number>;
  expectedA: number;
  actualA: number;
}

/**
 * Compute rating deltas for all four players in a game.
 * Pure: does not mutate `players`.
 */
export function rateGame(
  players: Record<string, Player>,
  g: GameResult,
  cfg: RatingConfig = DEFAULT_CONFIG.rating,
): GameRatingOutcome {
  const pa1 = players[g.teamA.a], pa2 = players[g.teamA.b];
  const pb1 = players[g.teamB.a], pb2 = players[g.teamB.b];
  const rA = teamRating(pa1.rating, pa2.rating);
  const rB = teamRating(pb1.rating, pb2.rating);
  const eA = expectedShare(rA, rB, cfg);
  const eB = 1 - eA; // symmetric by construction of the clip
  const aA = actualShare(g.scoreA, g.scoreB);
  const aB = 1 - aA;
  // Court-strength weighting (v3): how strong was the opposition, relative to the field?
  const wA = strengthWeight(rB, aA - eA, players, cfg);
  const wB = strengthWeight(rA, aB - eB, players, cfg);
  return {
    deltas: {
      [pa1.id]: ratingDelta(pa1.games, aA, eA, cfg) * wA,
      [pa2.id]: ratingDelta(pa2.games, aA, eA, cfg) * wA,
      [pb1.id]: ratingDelta(pb1.games, aB, eB, cfg) * wB,
      [pb2.id]: ratingDelta(pb2.games, aB, eB, cfg) * wB,
    },
    expectedA: eA,
    actualA: aA,
  };
}

/**
 * Court-strength weight for one team's rating change (RatingConfig.courtWeight).
 * Beating a pair weaker than the session average (a lower court) counts for less;
 * beating a stronger pair, more. A loss to a strong pair costs less; to a weak
 * pair, more. 1 when the setting is off.
 */
export function strengthWeight(oppTeam: number, surprise: number, players: Record<string, Player>, cfg: RatingConfig): number {
  const w = cfg.courtWeight;
  if (!w) return 1;
  const all = Object.values(players);
  if (!all.length) return 1;
  const field = all.reduce((a, p) => a + p.rating, 0) / all.length;
  const rel = (oppTeam - field) / w.scale;
  return clamp(surprise >= 0 ? 1 + rel : 1 - rel, w.min, w.max);
}

/** Apply a game result: returns a new players map with ratings, games and history updated. */
export function applyGame(
  players: Record<string, Player>,
  g: GameResult,
  cfg: RatingConfig = DEFAULT_CONFIG.rating,
): Record<string, Player> {
  const { deltas } = rateGame(players, g, cfg);
  const next: Record<string, Player> = { ...players };
  const skip = new Set(g.unrated ?? []);
  for (const id of Object.keys(deltas)) {
    if (skip.has(id)) continue; // an unknown substitute played this slot
    const p = players[id];
    const rating = p.rating + deltas[id];
    next[id] = { ...p, rating, games: p.games + 1, history: [...p.history, rating] };
  }
  return next;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Level bands: the boundary between two neighbouring levels is halfway between
 * their starting ratings. With 900/980/1060/1140:
 * beginner < 940 ≤ standard < 1020 ≤ intermediate < 1100 ≤ strong.
 */
const ORDER: Player['level'][] = ['beginner', 'standard', 'intermediate', 'strong'];

export function bandBounds(level: Player['level'], start: Record<Player['level'], number>): [number, number] {
  const i = ORDER.indexOf(level);
  const lo = i === 0 ? -Infinity : (start[ORDER[i - 1]] + start[level]) / 2;
  const hi = i === ORDER.length - 1 ? Infinity : (start[level] + start[ORDER[i + 1]]) / 2;
  return [lo, hi];
}

export function bandOf(rating: number, start: Record<Player['level'], number>): Player['level'] {
  for (const l of ORDER) { const [lo, hi] = bandBounds(l, start); if (rating >= lo && rating < hi) return l; }
  return 'strong';
}

/** How far a rating sits outside a level's band (0 = inside). */
export function outsideBand(rating: number, level: Player['level'], start: Record<Player['level'], number>): number {
  const [lo, hi] = bandBounds(level, start);
  return rating < lo ? lo - rating : rating >= hi ? rating - hi : 0;
}

export function makePlayer(id: string, name: string, level: Player['level'], cfg: RatingConfig = DEFAULT_CONFIG.rating): Player {
  return {
    id, name, level,
    rating: cfg.start[level],
    games: 0, sitOuts: 0, satLastRound: false,
    beginner: level === 'beginner',
    aboveMedianStreak: 0,
    history: [],
    startLevel: level,
    registeredLevel: level,
    levelChanges: [],
    levelLocked: false,
  };
}

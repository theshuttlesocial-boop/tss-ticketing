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
  return {
    deltas: {
      [pa1.id]: ratingDelta(pa1.games, aA, eA, cfg),
      [pa2.id]: ratingDelta(pa2.games, aA, eA, cfg),
      [pb1.id]: ratingDelta(pb1.games, aB, eB, cfg),
      [pb2.id]: ratingDelta(pb2.games, aB, eB, cfg),
    },
    expectedA: eA,
    actualA: aA,
  };
}

/** Apply a game result: returns a new players map with ratings, games and history updated. */
export function applyGame(
  players: Record<string, Player>,
  g: GameResult,
  cfg: RatingConfig = DEFAULT_CONFIG.rating,
): Record<string, Player> {
  const { deltas } = rateGame(players, g, cfg);
  const next: Record<string, Player> = { ...players };
  for (const id of Object.keys(deltas)) {
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
 * End-of-round promotion check. A beginner whose rating has been above the
 * session median for `promotionRounds` consecutive rounds loses the flag —
 * permanently for this session.
 */
export function applyPromotion(
  players: Record<string, Player>,
  cfg: RatingConfig = DEFAULT_CONFIG.rating,
): Record<string, Player> {
  const med = median(Object.values(players).map((p) => p.rating));
  const next: Record<string, Player> = {};
  for (const p of Object.values(players)) {
    if (!p.beginner) { next[p.id] = p; continue; }
    const streak = p.rating > med ? p.aboveMedianStreak + 1 : 0;
    next[p.id] = { ...p, aboveMedianStreak: streak, beginner: streak < cfg.promotionRounds };
  }
  return next;
}

export function makePlayer(id: string, name: string, level: Player['level'], cfg: RatingConfig = DEFAULT_CONFIG.rating): Player {
  return {
    id, name, level,
    rating: cfg.start[level],
    games: 0, sitOuts: 0, satLastRound: false,
    beginner: level === 'beginner',
    aboveMedianStreak: 0,
    history: [],
  };
}

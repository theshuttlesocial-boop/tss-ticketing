/** Core domain types for the TSS Live Session module. */

export type PlayerId = string;

export type Level = 'beginner' | 'standard' | 'strong';

export interface Player {
  id: PlayerId;
  name: string;
  level: Level;
  /** Current performance rating. */
  rating: number;
  /** Rated games played this session. */
  games: number;
  /** Rounds sat out this session. */
  sitOuts: number;
  /** Did they sit out the most recent round? */
  satLastRound: boolean;
  /** Beginner flag — enforces the court ceiling. Clears on promotion, never re-applies. */
  beginner: boolean;
  /** Consecutive rounds the player's rating has been above the session median (for promotion). */
  aboveMedianStreak: number;
  /** Rating history, one entry per rated game, for the TV/player page. */
  history: number[];
}

export interface Pair {
  a: PlayerId;
  b: PlayerId;
}

export interface Match {
  court: number; // 1-based, 1 = top court
  teamA: Pair;
  teamB: Pair;
}

export interface Round {
  index: number; // 1-based
  matches: Match[];
  sitOuts: PlayerId[];
}

export interface GameResult {
  round: number;
  court: number;
  teamA: Pair;
  teamB: Pair;
  scoreA: number;
  scoreB: number;
}

export interface RatingConfig {
  /** Starting ratings by registration level. */
  start: Record<Level, number>;
  /** Expected-share divisor: E = 0.5 + gap / divisor. */
  divisor: number;
  /** Clip range for expected share. */
  clip: [number, number];
  /** K by games already played: index 0 = 1st game. Last value repeats. */
  kSchedule: number[];
  /** Promotion: consecutive rounds above median required. */
  promotionRounds: number;
}

export interface RotationConfig {
  courts: number;
  /** Courts a beginner may occupy (1-based). */
  beginnerCourts: number[];
  /** Max courts a player may move between consecutive rounds; null = uncapped. */
  movementCap: number | null;
  /** Pair-split cost weights. */
  cost: {
    repeatPartner: number;
    repeatOpponent: number;
    /** Cost per 100 rating points between the two teams. */
    per100Gap: number;
  };
  /** Neighbour-swap: don't widen a court's rating spread past this. */
  maxCourtSpread: number;
}

export interface FinalsConfig {
  finalists: number;
  minGames: number;
  /** Confidence shrink: R_final = base + (R − base) × g / (g + shrink). */
  shrink: number;
  base: number;
}

export interface Config {
  rating: RatingConfig;
  rotation: RotationConfig;
  finals: FinalsConfig;
}

export const DEFAULT_CONFIG: Config = {
  rating: {
    start: { beginner: 900, standard: 1000, strong: 1050 },
    divisor: 1000,
    clip: [0.15, 0.85],
    kSchedule: [300, 300, 220, 220, 160],
    promotionRounds: 2,
  },
  rotation: {
    courts: 4,
    beginnerCourts: [3, 4],
    movementCap: 2,
    cost: { repeatPartner: 3, repeatOpponent: 1, per100Gap: 0.5 },
    maxCourtSpread: 150,
  },
  finals: { finalists: 4, minGames: 4, shrink: 2, base: 1000 },
};

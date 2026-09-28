/** Core domain types for the TSS Live Session module. */

export type PlayerId = string;

export type Level = 'beginner' | 'standard' | 'intermediate' | 'strong';

/**
 * A level change made during a session. Applies from `beforeRound` onwards:
 * games before it are rated as they were played. Moving up lifts the rating
 * to at least the new level's starting number, moving down caps it there
 * (`adjust: false` records the change without touching the rating — used for
 * edits recorded after the fact).
 */
export interface LevelChange {
  from: Level;
  to: Level;
  beforeRound: number;
  by: 'admin' | 'system';
  reason?: string;
  at?: string;
  adjust?: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** Current level: drives the beginner/strong rules and is shown to admins. */
  level: Level;
  /** Level that sets the starting rating. Defaults to `level`. */
  startLevel?: Level;
  /** What the player picked when they registered. Never changes. */
  registeredLevel?: Level;
  /** Mid-session level changes, oldest first. */
  levelChanges?: LevelChange[];
  /** Admin has locked the level: automatic review never moves it. */
  levelLocked?: boolean;
  /** Current performance rating. */
  rating: number;
  /** Rated games played this session. */
  games: number;
  /** Rounds sat out this session. */
  sitOuts: number;
  /** Did they sit out the most recent round? */
  satLastRound: boolean;
  /** Beginner flag: current level is beginner. Enforces the court ceiling and the strong/beginner rule. */
  beginner: boolean;
  /** Unused since level review replaced median promotion; kept for the column. */
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
  /**
   * Players whose rating this game must not touch — an unknown substitute
   * played in their place. The game still rates the other three, using the
   * listed player's rating as the stand-in.
   */
  unrated?: PlayerId[];
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
  /** Legacy: median promotion, replaced by `levels` review. Ignored. */
  promotionRounds?: number;
}

export interface RotationConfig {
  courts: number;
  /** Courts a beginner may occupy (1-based). */
  beginnerCourts: number[];
  /** Max courts a player may move between consecutive rounds; null = uncapped. */
  movementCap: number | null;
  /** Pair-split cost weights. Higher = the solver avoids it harder. */
  cost: {
    repeatPartner: number;
    repeatOpponent: number;
    /** Cost per 100 rating points between the two teams. */
    per100Gap: number;
    /**
     * Cost of putting a registered 'strong' and a registered 'beginner' in the
     * same pair. Levels, not ratings: in the first rounds everyone still sits
     * on their starting rating, so this is what stops a beginner being carried
     * by a strong player before the ratings have said anything.
     */
    strongWithBeginner: number;
    /**
     * Cost of a registered 'strong' facing a registered 'beginner' across the
     * net. Lower than the partner penalty: when both are on the same court the
     * solver cannot avoid one or the other, and being carried is worse for the
     * beginner than being beaten.
     */
    strongVsBeginner: number;
  };
  /** Neighbour-swap: don't widen a court's rating spread past this. */
  maxCourtSpread: number;
  /**
   * Neighbour-swap: furthest a swap may leave anyone from their natural block
   * (rating rank among those playing, in fours). null = no limit (pre-v2).
   */
  maxSwapDistance: number | null;
  /** Neighbour-swap: never widen a court's team gap by more than this. null = no limit (pre-v2). */
  maxSwapGapIncrease: number | null;
  /**
   * With only one or two flagged beginners in a round, pair each with the
   * highest-rated non-strong player on their court, as a partner.
   */
  loneBeginnerPairing: boolean;
}

/** Automatic level review, run after every scored round. */
export interface LevelsConfig {
  /** Off = suggest only: an admin taps Apply. Moves down to beginner always apply. */
  autoApply: boolean;
  /** Games a player must have played (not by a substitute) before a move. */
  minGames: number;
  /** Scored rounds in a row their rating must sit in another band. */
  roundsInBand: number;
  /** How far inside the new band the rating must be, so levels don't flip back. */
  hysteresis: number;
  /** Flag a game won by this many points or more. */
  mismatchMargin: number;
  /** ... or whose point share missed the expected share by this much. */
  mismatchShare: number;
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
  levels: LevelsConfig;
}

/**
 * Bump when DEFAULT_CONFIG changes in a way sessions should know about.
 * 1 = sessions created before versioning. 2 = swap limits, lone-beginner
 * pairing, level review.
 */
export const CONFIG_VERSION = 2;

export const DEFAULT_CONFIG: Config = {
  rating: {
    // Four levels, evenly spaced. Wider than the old three-level spread
    // (900/1000/1050) so the extra rung actually separates people in round 1,
    // before any result exists to sort them.
    start: { beginner: 900, standard: 980, intermediate: 1060, strong: 1140 },
    divisor: 1000,
    clip: [0.15, 0.85],
    kSchedule: [300, 300, 220, 220, 160],
  },
  rotation: {
    courts: 4,
    beginnerCourts: [3, 4],
    movementCap: 2,
    // Game quality first: a 100-point team gap now costs the same as repeating
    // a partner, so the solver buys balance with variety rather than the
    // reverse. per100Gap was 0.5.
    cost: { repeatPartner: 3, repeatOpponent: 1, per100Gap: 3, strongWithBeginner: 6, strongVsBeginner: 2 },
    maxCourtSpread: 150,
    maxSwapDistance: 1,
    maxSwapGapIncrease: 25,
    loneBeginnerPairing: true,
  },
  finals: { finalists: 4, minGames: 4, shrink: 2, base: 1000 },
  levels: { autoApply: true, minGames: 3, roundsInBand: 2, hysteresis: 30, mismatchMargin: 12, mismatchShare: 0.2 },
};

/**
 * A stored config with every key it predates filled from the defaults.
 * Stored values win, so an old session keeps replaying exactly as it was
 * played; only settings it never had take today's defaults.
 */
export function normaliseConfig(stored: any): Config {
  const c = stored ?? {};
  const d = DEFAULT_CONFIG;
  return {
    ...c,
    rating: { ...d.rating, ...c.rating, start: { ...d.rating.start, ...c.rating?.start } },
    rotation: { ...d.rotation, ...c.rotation, cost: { ...d.rotation.cost, ...c.rotation?.cost } },
    finals: { ...d.finals, ...c.finals },
    levels: { ...d.levels, ...c.levels },
  };
}

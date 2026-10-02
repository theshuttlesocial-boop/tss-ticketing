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
  /** Linked TSS account (players.id), if any. Admin-only; never public. */
  accountId?: string;
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
  /** Round timer, stored server-side (see lib/live-session/timer.ts). */
  timer?: TimerState;
}

/** Server-stored round timer. Fields documented in lib/live-session/timer.ts. */
export interface TimerState {
  startedAt: string | null;
  durationS: number | null;
  pausedAt: string | null;
  remainingS: number | null;
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
  /**
   * Weight a game by how strong the opposition was, relative to everyone in the
   * session (v3). Points won against a weaker pair (a lower court) move a rating
   * less; against a stronger pair, more. Losses mirror it. Absent = off, so
   * sessions played before it replay exactly as they were.
   *   weight = clamp(1 ± (opposition − session average) / scale, min, max)
   */
  courtWeight?: { scale: number; min: number; max: number } | null;
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
    /** v3: cost per level of difference between the two teams' combined levels (e.g. St+St v I+I = 2). */
    levelGap?: number;
    /** v3: cost of partners two or more levels apart (intermediate+beginner, strong+standard, strong+beginner). */
    widePair?: number;
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
   * highest-rated non-strong player on their court, as a partner (with
   * `levelFirst`, the highest-rated standard where there is one).
   */
  loneBeginnerPairing: boolean;
  /**
   * v3 matching rules. Absent = off, so earlier sessions replay as played.
   *  - levelFirst: fill courts by level (strong → beginner), rating only orders
   *    players within a level. A level change is what moves someone between tiers.
   *  - evenBoundary: no court of three of one level and one of the level below —
   *    the weakest of the three drops a court, so the mixed court plays
   *    higher+lower v higher+lower.
   *  - sameLevelSwaps: the repeat-avoiding neighbour swap only trades players of
   *    the same level, so it can never pull a lower-level player onto a higher court.
   */
  levelFirst?: boolean;
  evenBoundary?: boolean;
  sameLevelSwaps?: boolean;
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
 * pairing, level review. 3 = level-first courts, even boundary courts,
 * same-level swaps, level-aware pairing costs, court-strength weighting.
 */
export const CONFIG_VERSION = 3;

export const DEFAULT_CONFIG: Config = {
  rating: {
    // Four levels, evenly spaced. Wider than the old three-level spread
    // (900/1000/1050) so the extra rung actually separates people in round 1,
    // before any result exists to sort them.
    start: { beginner: 900, standard: 980, intermediate: 1060, strong: 1140 },
    // v3 (tested on Sessions 88-90: prediction error 9.6 → 9.2 points of share):
    // a steeper expectation (100 points = 64/36, was 60/40), gentler early swings
    // (were 300/300/220/220/160) and court-strength weighting.
    divisor: 700,
    clip: [0.15, 0.85],
    kSchedule: [220, 220, 160, 160, 120],
    courtWeight: { scale: 150, min: 0.4, max: 1.6 },
  },
  rotation: {
    courts: 4,
    beginnerCourts: [3, 4],
    movementCap: 2,
    // Game quality first: a 100-point team gap now costs the same as repeating
    // a partner, so the solver buys balance with variety rather than the
    // reverse. per100Gap was 0.5.
    cost: { repeatPartner: 3, repeatOpponent: 1, per100Gap: 3, strongWithBeginner: 6, strongVsBeginner: 2, levelGap: 4, widePair: 6 },
    maxCourtSpread: 150,
    maxSwapDistance: 1,
    maxSwapGapIncrease: 25,
    loneBeginnerPairing: true,
    // v3: strongs with strongs (or the best intermediates), beginners with
    // beginners and standards. Tested on Sessions 88-90 (scripts/matching-v3-eval.ts).
    levelFirst: true,
    evenBoundary: true,
    sameLevelSwaps: true,
  },
  finals: { finalists: 4, minGames: 4, shrink: 2, base: 1000 },
  // Suggest-only by default: one night is too few games to move levels
  // reliably (see scripts/simulate-rotation.ts). Moves down to beginner
  // still apply on their own.
  levels: { autoApply: false, minGames: 3, roundsInBand: 2, hysteresis: 30, mismatchMargin: 12, mismatchShare: 0.2 },
};

/**
 * A stored config with every key it predates filled from the defaults.
 * Stored values win, so an old session keeps replaying exactly as it was
 * played; only settings it never had take today's defaults.
 */
export function normaliseConfig(stored: any): Config {
  const c = stored ?? {};
  const d = DEFAULT_CONFIG;
  // v3 settings a stored config predates stay OFF (not today's defaults), so a
  // session keeps replaying, and drawing, exactly as it was played.
  const v3Rating = c.rating && !('courtWeight' in c.rating) ? { courtWeight: null } : {};
  const v3Rotation = c.rotation && !('levelFirst' in c.rotation) ? { levelFirst: false, evenBoundary: false, sameLevelSwaps: false } : {};
  const v3Cost = c.rotation?.cost && !('levelGap' in c.rotation.cost) ? { levelGap: 0, widePair: 0 } : {};
  return {
    ...c,
    rating: { ...d.rating, ...v3Rating, ...c.rating, start: { ...d.rating.start, ...c.rating?.start } },
    rotation: { ...d.rotation, ...v3Rotation, ...c.rotation, cost: { ...d.rotation.cost, ...v3Cost, ...c.rotation?.cost } },
    finals: { ...d.finals, ...c.finals },
    levels: { ...d.levels, ...c.levels },
  };
}

/**
 * TSS Rating (v2) — every constant, in one place (Roadmap Phase 6).
 *
 * Modelled on Badminton England's published rating principles. BE doesn't
 * publish its exact win-chance formula, so this is our version of it; change
 * numbers here, never in the engine.
 */
export type Level = 'beginner' | 'standard' | 'intermediate' | 'strong';
export type Outcome = 'win_loss' | 'point_share';

export interface RatingV2Config {
  /** Starting rating by level (not age). The organiser can override for a newcomer. */
  start: Record<Level, number>;
  floor: number;
  /** Weighted own rating W = ownWeight × own + (1 − ownWeight) × partner. */
  ownWeight: number;
  /** Win chance p = clamp(0.5 + (W − Opp) / spread, 0, 1). A 75+ edge (spread/2) gains nothing for winning. */
  spread: number;
  /** Volatility M: `base` while ≤ `settledAfter` games, then shrinks by `shrinkPerGame` per game, never below `minFactor` × base. */
  volatility: { base: number; settledAfter: number; shrinkPerGame: number; minFactor: number };
  /** Games older than this don't count towards "games played" (M and confidence). */
  gamesWindowDays: number;
  /** Confidence in another player: min(1, floor + perGame × their games). */
  confidence: { floor: number; perGame: number };
  /** Until the club has this many rated games, confidence is 1 (so launch sessions still sort players). */
  bootstrapGames: number;
  /** Match weight F. */
  weight: { singleGame: number; close: number; closeMargin: number; final: number; social: number };
  /** After this many days away, M goes back to base for the next `inactiveBoostGames` games. No decay. */
  inactiveDays: number;
  inactiveBoostGames: number;
  /** Fewer rated games than this shows as "New" (and a beginner still counts as flagged). */
  newUntilGames: number;
  outcome: Outcome;
}

export const RATING_V2: RatingV2Config = {
  start: { beginner: 450, standard: 500, intermediate: 540, strong: 580 },
  floor: 400,
  ownWeight: 0.6,
  spread: 150,
  volatility: { base: 40, settledAfter: 20, shrinkPerGame: 0.02, minFactor: 0.5 },
  gamesWindowDays: 730,
  confidence: { floor: 0.2, perGame: 0.04 },
  bootstrapGames: 500,
  weight: { singleGame: 0.5, close: 0.25, closeMargin: 2, final: 0.5, social: 0 },
  inactiveDays: 120,
  inactiveBoostGames: 5,
  newUntilGames: 5,
  outcome: 'win_loss',
};

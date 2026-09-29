/**
 * TSS Rating (v2) engine. Pure functions; every number comes from config.ts.
 *
 * One persistent doubles rating per player, updated game by game in date
 * order across every session. A correction anywhere just means replaying.
 *
 *   W   = 0.6 × own + 0.4 × partner          (your weighted rating)
 *   Opp = mean of the two opponents
 *   p   = clamp(0.5 + (W − Opp)/150, 0, 1)   (your win chance)
 *   S   = 1 win, 0 loss, 0.5 timed draw      (or your share of the points, in point_share mode)
 *   Δ   = M × (S − p) × C × F
 */
import { Level, Outcome, RATING_V2, RatingV2Config } from './config';

export interface RatedGame {
  id?: string;
  at: string;                       // ISO date-time of the game
  teamA: [string, string];          // player keys
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
  kind?: 'normal' | 'final' | 'social';
  /** Players an unknown substitute played for: the game doesn't touch their rating. */
  unrated?: string[];
}

export interface PlayerState {
  key: string;
  rating: number;
  /** Rated-game dates, for "games in the last 2 years". */
  playedAt: string[];
  lastPlayed: string | null;
  /** Games still to play at full volatility after a long break. */
  boostLeft: number;
}

export interface NewPlayer { key: string; level: Level; startOverride?: number }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const DAY = 86_400_000;

export const newPlayer = (p: NewPlayer, cfg = RATING_V2): PlayerState =>
  ({ key: p.key, rating: p.startOverride ?? cfg.start[p.level], playedAt: [], lastPlayed: null, boostLeft: 0 });

/** Rated games within the rolling window, as of `at`. */
export const gamesPlayed = (p: PlayerState, at: string, cfg = RATING_V2) =>
  p.playedAt.filter((d) => Date.parse(at) - Date.parse(d) <= cfg.gamesWindowDays * DAY).length;

/** M: 40 while ≤ 20 games, then shrinking to 20 by 45 games; back to 40 for 5 games after a long break. */
export function volatility(games: number, boost: boolean, cfg = RATING_V2): number {
  const v = cfg.volatility;
  if (boost || games <= v.settledAfter) return v.base;
  return v.base * Math.max(v.minFactor, 1 - v.shrinkPerGame * (games - v.settledAfter));
}

export const confidenceIn = (games: number, cfg = RATING_V2) => Math.min(1, cfg.confidence.floor + cfg.confidence.perGame * games);

export const winChance = (w: number, opp: number, cfg = RATING_V2) => clamp(0.5 + (w - opp) / cfg.spread, 0, 1);

/** F: a game to 21 counts half a match (BE halves single-end matches); a ≤ 2-point game half again. */
export function matchWeight(g: RatedGame, cfg = RATING_V2): number {
  if (g.kind === 'social') return cfg.weight.social;
  if (g.kind === 'final') return cfg.weight.final;
  const margin = Math.abs(g.scoreA - g.scoreB);
  return margin > 0 && margin <= cfg.weight.closeMargin ? cfg.weight.close : cfg.weight.singleGame;
}

export function resultFor(mine: number, theirs: number, outcome: Outcome): number {
  if (outcome === 'point_share') return mine + theirs === 0 ? 0.5 : mine / (mine + theirs);
  return mine > theirs ? 1 : mine < theirs ? 0 : 0.5;
}

export interface GameOutcome {
  deltas: Record<string, number>;
  /** Team A's chance going in (from team means), for prediction accuracy. */
  predictedA: number;
  actualA: number;
}

/** Rate one game. `clubGames` = rated games the club has so far (for bootstrap mode). */
export function rateGame(players: Record<string, PlayerState>, g: RatedGame, clubGames: number, cfg = RATING_V2): GameOutcome {
  const F = matchWeight(g, cfg);
  const at = g.at;
  const r = (k: string) => players[k].rating;
  const teams: [[string, string], [string, string], number, number][] = [
    [g.teamA, g.teamB, g.scoreA, g.scoreB], [g.teamB, g.teamA, g.scoreB, g.scoreA]];
  const deltas: Record<string, number> = {};
  for (const [mine, theirs, my, their] of teams) {
    const opp = (r(theirs[0]) + r(theirs[1])) / 2;
    for (const [me, partner] of [[mine[0], mine[1]], [mine[1], mine[0]]] as const) {
      if ((g.unrated ?? []).includes(me)) continue;
      const P = players[me];
      const W = cfg.ownWeight * P.rating + (1 - cfg.ownWeight) * r(partner);
      const p = winChance(W, opp, cfg);
      const S = resultFor(my, their, cfg.outcome);
      const games = gamesPlayed(P, at, cfg);
      const M = volatility(games, P.boostLeft > 0, cfg);
      const C = clubGames < cfg.bootstrapGames ? 1
        : [partner, theirs[0], theirs[1]].map((k) => confidenceIn(gamesPlayed(players[k], at, cfg), cfg)).reduce((a, b) => a + b, 0) / 3;
      deltas[me] = M * (S - p) * C * F;
    }
  }
  const meanA = (r(g.teamA[0]) + r(g.teamA[1])) / 2, meanB = (r(g.teamB[0]) + r(g.teamB[1])) / 2;
  return { deltas, predictedA: winChance(meanA, meanB, cfg), actualA: resultFor(g.scoreA, g.scoreB, 'win_loss') };
}

export interface ReplayV2 {
  players: Record<string, PlayerState>;
  games: (GameOutcome & { game: RatedGame })[];
  clubGames: number;
}

/**
 * Replay every game in date order. `roster` gives each player's level (or
 * organiser override) for their first appearance.
 */
export function replayV2(roster: NewPlayer[], games: RatedGame[], cfg: RatingV2Config = RATING_V2): ReplayV2 {
  const players: Record<string, PlayerState> = {};
  for (const p of roster) players[p.key] = newPlayer(p, cfg);
  const out: ReplayV2['games'] = [];
  let club = 0;
  for (const g of [...games].sort((a, b) => a.at.localeCompare(b.at))) {
    const ids = [...g.teamA, ...g.teamB];
    for (const k of ids) if (!players[k]) players[k] = newPlayer({ key: k, level: 'standard' }, cfg);
    // Back after a long break: full volatility for the next few games. No decay.
    for (const k of ids) {
      const P = players[k];
      if (P.lastPlayed && Date.parse(g.at) - Date.parse(P.lastPlayed) > cfg.inactiveDays * DAY) P.boostLeft = cfg.inactiveBoostGames;
    }
    const res = rateGame(players, g, club, cfg);
    out.push({ ...res, game: g });
    for (const [k, d] of Object.entries(res.deltas)) {
      const P = players[k];
      players[k] = { ...P, rating: Math.max(cfg.floor, P.rating + d),
        playedAt: matchWeight(g, cfg) > 0 ? [...P.playedAt, g.at] : P.playedAt,
        lastPlayed: g.at, boostLeft: Math.max(0, P.boostLeft - 1) };
    }
    if (matchWeight(g, cfg) > 0) club++;
  }
  return { players, games: out, clubGames: club };
}

/** "New" until 5 rated games. */
export const isNew = (p: PlayerState, at: string, cfg = RATING_V2) => gamesPlayed(p, at, cfg) < cfg.newUntilGames;

/** How often the favourite (higher team mean) won, skipping draws and even games. */
export function predictionAccuracy(games: ReplayV2['games'], filter: (g: RatedGame) => boolean = () => true) {
  const called = games.filter((x) => filter(x.game) && x.actualA !== 0.5 && x.predictedA !== 0.5);
  const right = called.filter((x) => (x.predictedA > 0.5) === (x.actualA > 0.5)).length;
  return { games: called.length, right, accuracy: called.length ? right / called.length : null };
}

/**
 * Pure mapping between Supabase rows and the engine's `Session` shape.
 *
 * No I/O here on purpose — every function is a pure transform, so the
 * round-trip can be tested without a database. See mapping.test.ts.
 *
 * Table layout is documented in README.md and created by
 * supabase/migrations/005_live_sessions.sql.
 */
import type {
  Config, GameResult, Level, Pair, Player, Round, Match,
} from './engine';
import type { Session } from './engine';

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface LiveSessionRow {
  id: string;
  created_at?: string;
  name: string;
  config: Config;
  seed: number;
  status: 'setup' | 'live' | 'finished';
}

export interface LivePlayerRow {
  id: string;
  session_id: string;
  name: string;
  level: Level;
  rating: number;
  games: number;
  sit_outs: number;
  sat_last_round: boolean;
  beginner: boolean;
  above_median_streak: number;
  history: number[];
}

export interface LiveGameRow {
  id?: string;
  session_id: string;
  round: number;
  court: number;
  team_a: Pair;
  team_b: Pair;
  score_a: number | null;
  score_b: number | null;
}

export interface LiveRoundRow {
  id?: string;
  session_id: string;
  round: number;
  sit_outs: string[];
}

// ── Rows -> engine ────────────────────────────────────────────────────────────

export function rowToPlayer(r: LivePlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    rating: Number(r.rating),
    games: r.games,
    sitOuts: r.sit_outs,
    satLastRound: r.sat_last_round,
    beginner: r.beginner,
    aboveMedianStreak: r.above_median_streak,
    history: (r.history ?? []).map(Number),
  };
}

/**
 * Assemble a Session from the four tables.
 *
 * Note the engine keeps *assignments* (`rounds`) separate from *scored games*
 * (`results`), while `live_games` holds both — a row with null scores is an
 * assignment that has not been played. So each game row feeds `rounds`
 * unconditionally, and `results` only when scored.
 */
export function rowsToSession(
  session: LiveSessionRow,
  players: LivePlayerRow[],
  games: LiveGameRow[],
  rounds: LiveRoundRow[],
): Session {
  const byId: Record<string, Player> = {};
  for (const p of players) byId[p.id] = rowToPlayer(p);

  const ordered = [...games].sort((a, b) => a.round - b.round || a.court - b.court);
  const sitOutsByRound = new Map<number, string[]>();
  for (const r of rounds) sitOutsByRound.set(r.round, r.sit_outs ?? []);

  // Every round that exists in either table, so a round with all players
  // sitting out (or one generated but not yet scored) is not silently dropped.
  const indices = new Set<number>();
  for (const g of ordered) indices.add(g.round);
  for (const r of rounds) indices.add(r.round);

  const roundList: Round[] = [...indices].sort((a, b) => a - b).map((index) => ({
    index,
    matches: ordered
      .filter((g) => g.round === index)
      .map<Match>((g) => ({ court: g.court, teamA: g.team_a, teamB: g.team_b })),
    sitOuts: sitOutsByRound.get(index) ?? [],
  }));

  const results: GameResult[] = ordered
    .filter((g) => g.score_a !== null && g.score_b !== null)
    .map((g) => ({
      round: g.round,
      court: g.court,
      teamA: g.team_a,
      teamB: g.team_b,
      scoreA: g.score_a as number,
      scoreB: g.score_b as number,
    }));

  return { config: session.config, players: byId, rounds: roundList, results, seed: session.seed };
}

// ── Engine -> rows ────────────────────────────────────────────────────────────

/**
 * Player fields that `recomputeRatings` derives from the game list.
 * Written after every score entry.
 */
export function playerToDerivedRow(p: Player) {
  return {
    rating: p.rating,
    games: p.games,
    beginner: p.beginner,
    above_median_streak: p.aboveMedianStreak,
    history: p.history,
  };
}

/**
 * Player fields that `nextRound` advances and a recompute preserves.
 * Written after generating a round.
 */
export function playerToRotationRow(p: Player) {
  return { sit_outs: p.sitOuts, sat_last_round: p.satLastRound };
}

/** Full player row, for seeding the roster at session creation. */
export function playerToRow(p: Player, sessionId: string): LivePlayerRow {
  return {
    id: p.id,
    session_id: sessionId,
    name: p.name,
    level: p.level,
    ...playerToDerivedRow(p),
    ...playerToRotationRow(p),
  } as LivePlayerRow;
}

/** A generated round's court assignments, scores left null. */
export function roundToGameRows(round: Round, sessionId: string): LiveGameRow[] {
  return round.matches.map((m) => ({
    session_id: sessionId,
    round: round.index,
    court: m.court,
    team_a: m.teamA,
    team_b: m.teamB,
    score_a: null,
    score_b: null,
  }));
}

export function roundToRoundRow(round: Round, sessionId: string): LiveRoundRow {
  return { session_id: sessionId, round: round.index, sit_outs: round.sitOuts };
}

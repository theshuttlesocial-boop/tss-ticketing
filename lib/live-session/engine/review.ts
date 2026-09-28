/**
 * Automatic level review and mismatched-game flags.
 *
 * One rule for level changes, replacing the old "above the median for two
 * rounds" beginner promotion. Pure: the admin page runs it to show what will
 * happen, the server runs it before each draw to apply it.
 */
import { bandBounds, bandOf, outsideBand } from './rating';
import { LEVEL_ORDER, levelRank, replay, ReplayResult, Session } from './session';
import { Level, PlayerId } from './types';

export interface LevelProposal {
  playerId: PlayerId;
  name: string;
  from: Level;
  to: Level;
  rating: number;
  games: number;
  /** Applied at the next draw without an admin tap (autoApply, or a move down to beginner). */
  auto: boolean;
}

const step = (from: Level, toward: Level): Level =>
  LEVEL_ORDER[levelRank(from) + Math.sign(levelRank(toward) - levelRank(from))];

/**
 * Who should move one level, judged after the latest scored round.
 *
 * A player moves when all hold:
 *  - at least `minGames` rated games (games an unknown substitute played
 *    for them are not rated, so they never count);
 *  - after each of the last `roundsInBand` rounds they played since their
 *    last level change, their rating sat in a band on the same side of
 *    their current level;
 *  - their rating now is at least `hysteresis` points inside the band one
 *    step over, so a borderline player doesn't flip back and forth.
 * Never more than one step at a time, never a locked player, never a move an
 * admin has undone this session (`blocked` holds "playerId:level").
 */
export function reviewLevels(
  s: Session,
  opts: { exclude?: Set<PlayerId>; blocked?: Set<string>; rp?: ReplayResult } = {},
): LevelProposal[] {
  const cfg = s.config.levels;
  const start = s.config.rating.start;
  const rp = opts.rp ?? replay(s);
  const out: LevelProposal[] = [];

  for (const p of Object.values(rp.players)) {
    if (opts.exclude?.has(p.id) || p.levelLocked) continue;
    if (p.games < cfg.minGames) continue;

    const since = Math.max(0, ...(p.levelChanges ?? []).map((c) => c.beforeRound));
    const played = [...new Set(s.results
      .filter((g) => g.round >= since && [g.teamA.a, g.teamA.b, g.teamB.a, g.teamB.b].includes(p.id)
        && !(g.unrated ?? []).includes(p.id))
      .map((g) => g.round))].sort((a, b) => a - b);
    const recent = played.slice(-cfg.roundsInBand);
    if (recent.length < cfg.roundsInBand) continue;

    const dirs = recent.map((r) => {
      const band = bandOf(rp.afterRound.get(r)![p.id].rating, start);
      return Math.sign(levelRank(band) - levelRank(p.level));
    });
    const dir = dirs[0];
    if (dir === 0 || dirs.some((d) => d !== dir)) continue;

    const to = step(p.level, dir > 0 ? 'strong' : 'beginner');
    const [lo, hi] = bandBounds(to, start);
    const deepEnough = dir > 0 ? p.rating >= lo + cfg.hysteresis : p.rating < hi - cfg.hysteresis;
    if (!deepEnough) continue;
    if (opts.blocked?.has(`${p.id}:${to}`)) continue;

    out.push({ playerId: p.id, name: p.name, from: p.level, to, rating: p.rating, games: p.games,
      auto: cfg.autoApply || to === 'beginner' });
  }
  return out;
}

export interface GameFlag {
  round: number;
  court: number;
  margin: number;
  expectedA: number;
  actualA: number;
  /** Most likely reason, with a one-step level change to offer. */
  cause: { playerId: PlayerId; name: string; level: Level; rating: number; suggest: Level | null } | null;
}

/**
 * Flag games that were badly matched: won by `mismatchMargin`+ points, or
 * whose point share missed the expectation by `mismatchShare`+. Names the
 * player on court most likely responsible — furthest outside their level's
 * band now, else whoever's rating has moved most from their start.
 */
export function flagGames(s: Session, rp: ReplayResult = replay(s)): GameFlag[] {
  const cfg = s.config.levels;
  const start = s.config.rating.start;
  const flags: GameFlag[] = [];
  for (const g of rp.games) {
    if (g.margin < cfg.mismatchMargin && Math.abs(g.actualA - g.expectedA) < cfg.mismatchShare) continue;
    const ids = Object.keys(g.pre);
    const ps = ids.map((id) => rp.players[id]).filter(Boolean);
    let pick = ps.map((p) => ({ p, out: outsideBand(p.rating, p.level, start) }))
      .sort((a, b) => b.out - a.out)[0];
    if (!pick || pick.out === 0) {
      pick = ps.map((p) => ({ p, out: Math.abs(p.rating - start[p.startLevel ?? p.level]) }))
        .sort((a, b) => b.out - a.out)[0];
    }
    const band = pick ? bandOf(pick.p.rating, start) : null;
    flags.push({
      round: g.round, court: g.court, margin: g.margin, expectedA: g.expectedA, actualA: g.actualA,
      cause: pick ? {
        playerId: pick.p.id, name: pick.p.name, level: pick.p.level, rating: pick.p.rating,
        suggest: band && band !== pick.p.level ? step(pick.p.level, band) : null,
      } : null,
    });
  }
  return flags;
}

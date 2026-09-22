import { DEFAULT_CONFIG, FinalsConfig, GameResult, Match, Player, PlayerId } from './types';

/** Confidence-adjusted rating: shrinks toward base for players with few games. */
export function confidenceRating(p: Player, cfg: FinalsConfig = DEFAULT_CONFIG.finals): number {
  return cfg.base + (p.rating - cfg.base) * (p.games / (p.games + cfg.shrink));
}

export interface Standing {
  id: PlayerId;
  name: string;
  rating: number;
  confRating: number;
  games: number;
  strengthOfSchedule: number;
  avgPointShare: number;
  pointDiff: number;
  eligible: boolean;
}

export function standings(
  players: Record<string, Player>,
  results: GameResult[],
  cfg: FinalsConfig = DEFAULT_CONFIG.finals,
): Standing[] {
  const sos = new Map<PlayerId, number[]>();
  const share = new Map<PlayerId, number[]>();
  const diff = new Map<PlayerId, number>();
  const push = (m: Map<PlayerId, number[]>, id: PlayerId, v: number) => m.set(id, [...(m.get(id) ?? []), v]);

  for (const g of results) {
    const total = g.scoreA + g.scoreB || 1;
    const oppA = (players[g.teamB.a].rating + players[g.teamB.b].rating) / 2;
    const oppB = (players[g.teamA.a].rating + players[g.teamA.b].rating) / 2;
    for (const id of [g.teamA.a, g.teamA.b]) {
      push(sos, id, oppA); push(share, id, g.scoreA / total); diff.set(id, (diff.get(id) ?? 0) + g.scoreA - g.scoreB);
    }
    for (const id of [g.teamB.a, g.teamB.b]) {
      push(sos, id, oppB); push(share, id, g.scoreB / total); diff.set(id, (diff.get(id) ?? 0) + g.scoreB - g.scoreA);
    }
  }
  const mean = (xs: number[] | undefined) => (xs && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const rows: Standing[] = Object.values(players).map((p) => ({
    id: p.id, name: p.name, rating: p.rating, games: p.games,
    confRating: confidenceRating(p, cfg),
    strengthOfSchedule: mean(sos.get(p.id)),
    avgPointShare: mean(share.get(p.id)),
    pointDiff: diff.get(p.id) ?? 0,
    eligible: p.games >= cfg.minGames,
  }));

  // Head-to-head between two players: point share in games where they were opponents.
  const h2h = (x: PlayerId, y: PlayerId): number => {
    let sx = 0, sy = 0;
    for (const g of results) {
      const inA = (id: PlayerId) => id === g.teamA.a || id === g.teamA.b;
      const inB = (id: PlayerId) => id === g.teamB.a || id === g.teamB.b;
      if (inA(x) && inB(y)) { sx += g.scoreA; sy += g.scoreB; }
      else if (inB(x) && inA(y)) { sx += g.scoreB; sy += g.scoreA; }
    }
    return sx - sy;
  };

  rows.sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    b.confRating - a.confRating ||
    b.games - a.games ||
    b.strengthOfSchedule - a.strengthOfSchedule ||
    b.avgPointShare - a.avgPointShare ||
    h2h(b.id, a.id) ||
    b.pointDiff - a.pointDiff ||
    0, // final tie: open coin toss — left to the admin
  );
  return rows;
}

/** Grand final: 1st & 4th vs 2nd & 3rd. */
export function grandFinal(table: Standing[], cfg: FinalsConfig = DEFAULT_CONFIG.finals): Match | null {
  const top = table.filter((s) => s.eligible).slice(0, cfg.finalists);
  if (top.length < 4) return null;
  return { court: 1, teamA: { a: top[0].id, b: top[3].id }, teamB: { a: top[1].id, b: top[2].id } };
}

import { DEFAULT_CONFIG, Match, Pair, Player, PlayerId, RotationConfig, Round } from './types';

/** Small seeded PRNG (mulberry32) so "ties random" is reproducible in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x: PlayerId, y: PlayerId) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Partner / opponent repeat counts built from previously assigned rounds. */
export class History {
  partners = new Map<string, number>();
  opponents = new Map<string, number>();
  lastCourt = new Map<PlayerId, number>();

  constructor(rounds: Round[] = []) {
    for (const r of rounds) this.addRound(r);
  }

  addRound(r: Round) {
    for (const m of r.matches) this.addMatch(m);
  }

  addMatch(m: Match) {
    const bump = (map: Map<string, number>, x: PlayerId, y: PlayerId) => map.set(key(x, y), (map.get(key(x, y)) ?? 0) + 1);
    bump(this.partners, m.teamA.a, m.teamA.b);
    bump(this.partners, m.teamB.a, m.teamB.b);
    for (const x of [m.teamA.a, m.teamA.b]) for (const y of [m.teamB.a, m.teamB.b]) bump(this.opponents, x, y);
    for (const id of [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]) this.lastCourt.set(id, m.court);
  }

  partnerRepeats(x: PlayerId, y: PlayerId) { return this.partners.get(key(x, y)) ?? 0; }
  opponentRepeats(x: PlayerId, y: PlayerId) { return this.opponents.get(key(x, y)) ?? 0; }
}

/* ------------------------------------------------------------------ */
/* Step 1 — sit-outs                                                   */
/* ------------------------------------------------------------------ */

/**
 * Choose who sits this round: fewest sit-outs so far sit first (i.e. players
 * who have played most), never two rounds in a row, ties random.
 */
export function chooseSitOuts(players: Player[], courts: number, rand: () => number): PlayerId[] {
  const need = players.length - courts * 4;
  if (need <= 0) return [];
  const shuffled = [...players].sort(() => rand() - 0.5);
  // Eligible first (didn't sit last round), then forced (only if we must).
  const eligible = shuffled.filter((p) => !p.satLastRound).sort((a, b) => a.sitOuts - b.sitOuts);
  const forced = shuffled.filter((p) => p.satLastRound).sort((a, b) => a.sitOuts - b.sitOuts);
  return [...eligible, ...forced].slice(0, need).map((p) => p.id);
}

/* ------------------------------------------------------------------ */
/* Steps 2–3 — sort, cut into courts, beginner ceiling, movement cap   */
/* ------------------------------------------------------------------ */

export function cutIntoCourts(active: Player[]): Player[][] {
  const sorted = [...active].sort((a, b) => b.rating - a.rating);
  const courts: Player[][] = [];
  for (let i = 0; i < sorted.length; i += 4) courts.push(sorted.slice(i, i + 4));
  return courts;
}

/**
 * Beginner ceiling: a flagged beginner on a court above the ceiling is swapped
 * with the top-rated non-beginner sitting on an allowed court.
 */
export function applyBeginnerCeiling(courts: Player[][], cfg: RotationConfig): Player[][] {
  const out = courts.map((c) => [...c]);
  const allowed = new Set(cfg.beginnerCourts.map((c) => c - 1)); // 0-based
  for (let ci = 0; ci < out.length; ci++) {
    if (allowed.has(ci)) continue;
    for (let pi = 0; pi < out[ci].length; pi++) {
      if (!out[ci][pi].beginner) continue;
      // find best non-beginner on an allowed court
      let best: { ci: number; pi: number } | null = null;
      for (const aci of allowed) {
        if (aci >= out.length) continue;
        for (let api = 0; api < out[aci].length; api++) {
          const cand = out[aci][api];
          if (cand.beginner) continue;
          if (!best || cand.rating > out[best.ci][best.pi].rating) best = { ci: aci, pi: api };
        }
      }
      if (!best) continue; // nobody to swap with — leave as is
      const tmp = out[ci][pi];
      out[ci][pi] = out[best.ci][best.pi];
      out[best.ci][best.pi] = tmp;
    }
  }
  return out.map((c) => c.sort((a, b) => b.rating - a.rating));
}

/**
 * Optional movement cap: nobody moves more than `cap` courts from their last
 * court. A player over the cap is swapped with the nearest-rated player on the
 * boundary court in their direction of travel.
 */
export function applyMovementCap(courts: Player[][], hist: History, cfg: RotationConfig): Player[][] {
  if (cfg.movementCap == null) return courts;
  const out = courts.map((c) => [...c]);
  const cap = cfg.movementCap;
  let changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (let ci = 0; ci < out.length && !changed; ci++) {
      for (let pi = 0; pi < out[ci].length && !changed; pi++) {
        const p = out[ci][pi];
        const prev = hist.lastCourt.get(p.id);
        if (prev == null) continue;
        const prev0 = prev - 1;
        if (Math.abs(ci - prev0) <= cap) continue;
        const target = ci > prev0 ? prev0 + cap : prev0 - cap;
        // swap with the player on target court who is closest in rating and whose own move stays legal
        let best = -1, bestGap = Infinity;
        for (let ti = 0; ti < out[target].length; ti++) {
          const q = out[target][ti];
          const qPrev = hist.lastCourt.get(q.id);
          if (qPrev != null && Math.abs(ci - (qPrev - 1)) > cap) continue;
          if (q.beginner && !cfg.beginnerCourts.includes(ci + 1)) continue;
          const gap = Math.abs(q.rating - p.rating);
          if (gap < bestGap) { bestGap = gap; best = ti; }
        }
        if (best < 0) continue;
        const q = out[target][best];
        out[target][best] = p;
        out[ci][pi] = q;
        changed = true;
      }
    }
  }
  return out.map((c) => c.sort((a, b) => b.rating - a.rating));
}

/* ------------------------------------------------------------------ */
/* Step 4 — pair split by cost                                         */
/* ------------------------------------------------------------------ */

export interface SplitChoice { teamA: Pair; teamB: Pair; cost: number; repeats: number }

/** The three splits of 4 players (sorted by rating desc), skill-balanced first. */
export function splitsOf(c: Player[]): [Pair, Pair][] {
  const [p1, p2, p3, p4] = c;
  return [
    [{ a: p1.id, b: p4.id }, { a: p2.id, b: p3.id }], // 1&4 v 2&3 — balanced
    [{ a: p1.id, b: p3.id }, { a: p2.id, b: p4.id }],
    [{ a: p1.id, b: p2.id }, { a: p3.id, b: p4.id }],
  ];
}

/** True when a pair puts a registered 'strong' alongside a registered 'beginner'. */
export function isStrongWithBeginner(court: Player[], pair: Pair): boolean {
  const lvl = (id: PlayerId) => court.find((p) => p.id === id)?.level;
  const a = lvl(pair.a), b = lvl(pair.b);
  return (a === 'strong' && b === 'beginner') || (a === 'beginner' && b === 'strong');
}

export function splitCost(court: Player[], teamA: Pair, teamB: Pair, hist: History, cfg: RotationConfig): { cost: number; repeats: number } {
  const r = (id: PlayerId) => court.find((p) => p.id === id)!.rating;
  const partnerRep = hist.partnerRepeats(teamA.a, teamA.b) + hist.partnerRepeats(teamB.a, teamB.b);
  let oppRep = 0;
  for (const x of [teamA.a, teamA.b]) for (const y of [teamB.a, teamB.b]) oppRep += hist.opponentRepeats(x, y);
  const gap = Math.abs((r(teamA.a) + r(teamA.b)) / 2 - (r(teamB.a) + r(teamB.b)) / 2);
  const mismatch =
    (isStrongWithBeginner(court, teamA) ? 1 : 0) + (isStrongWithBeginner(court, teamB) ? 1 : 0);
  // Strong facing beginner across the net, counted per opposing pairing.
  const lvl = (id: PlayerId) => court.find((p) => p.id === id)?.level;
  let facing = 0;
  for (const x of [teamA.a, teamA.b]) {
    for (const y of [teamB.a, teamB.b]) {
      const lx = lvl(x), ly = lvl(y);
      if ((lx === 'strong' && ly === 'beginner') || (lx === 'beginner' && ly === 'strong')) facing++;
    }
  }
  const cost =
    cfg.cost.repeatPartner * partnerRep +
    cfg.cost.repeatOpponent * oppRep +
    cfg.cost.per100Gap * (gap / 100) +
    (cfg.cost.strongWithBeginner ?? 0) * mismatch +
    (cfg.cost.strongVsBeginner ?? 0) * facing;
  return { cost, repeats: partnerRep + oppRep };
}

export function chooseSplit(court: Player[], hist: History, cfg: RotationConfig): SplitChoice {
  const sorted = [...court].sort((a, b) => b.rating - a.rating);
  let best: SplitChoice | null = null;
  for (const [teamA, teamB] of splitsOf(sorted)) {
    const { cost, repeats } = splitCost(sorted, teamA, teamB, hist, cfg);
    if (!best || cost < best.cost - 1e-9) best = { teamA, teamB, cost, repeats }; // strict < keeps balanced on ties
  }
  return best!;
}

/* ------------------------------------------------------------------ */
/* Step 5 — neighbour-swap pass                                        */
/* ------------------------------------------------------------------ */

const spread = (c: Player[]) => Math.max(...c.map((p) => p.rating)) - Math.min(...c.map((p) => p.rating));

export function neighbourSwap(courts: Player[][], hist: History, cfg: RotationConfig): Player[][] {
  const out = courts.map((c) => [...c]);
  const repeatsOf = (c: Player[]) => chooseSplit(c, hist, cfg).repeats;
  let improved = true, guard = 0;
  while (improved && guard++ < 20) {
    improved = false;
    for (let ci = 0; ci + 1 < out.length; ci++) {
      const before = repeatsOf(out[ci]) + repeatsOf(out[ci + 1]);
      if (before === 0) continue;
      let bestSwap: { i: number; j: number; after: number } | null = null;
      for (let i = 0; i < out[ci].length; i++) {
        for (let j = 0; j < out[ci + 1].length; j++) {
          const p = out[ci][i], q = out[ci + 1][j];
          // beginner ceiling must survive the swap
          if (q.beginner && !cfg.beginnerCourts.includes(ci + 1)) continue;
          const upper = out[ci].map((x, k) => (k === i ? q : x));
          const lower = out[ci + 1].map((x, k) => (k === j ? p : x));
          if (spread(upper) > cfg.maxCourtSpread || spread(lower) > cfg.maxCourtSpread) continue;
          const after = repeatsOf(upper) + repeatsOf(lower);
          if (after < before && (!bestSwap || after < bestSwap.after)) bestSwap = { i, j, after };
        }
      }
      if (bestSwap) {
        const p = out[ci][bestSwap.i];
        out[ci][bestSwap.i] = out[ci + 1][bestSwap.j];
        out[ci + 1][bestSwap.j] = p;
        improved = true;
      }
    }
  }
  return out.map((c) => c.sort((a, b) => b.rating - a.rating));
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface SolveResult {
  round: Round;
  /** Diagnostics for the admin page. */
  courts: { court: number; players: Player[]; split: SplitChoice }[];
}

/**
 * Solve the next round. Pure: takes current player state + previous rounds.
 */
export function solveRound(
  playersMap: Record<string, Player>,
  previousRounds: Round[],
  cfg: RotationConfig = DEFAULT_CONFIG.rotation,
  seed = 1,
): SolveResult {
  const rand = rng(seed + previousRounds.length * 7919);
  const players = Object.values(playersMap);
  const hist = new History(previousRounds);

  const sitOuts = chooseSitOuts(players, cfg.courts, rand);
  const sitSet = new Set(sitOuts);
  const active = players.filter((p) => !sitSet.has(p.id));

  let courts = cutIntoCourts(active);
  courts = applyBeginnerCeiling(courts, cfg);
  courts = applyMovementCap(courts, hist, cfg);
  courts = applyBeginnerCeiling(courts, cfg); // cap pass must not undo the ceiling
  courts = neighbourSwap(courts, hist, cfg);

  const diag = courts.map((c, i) => ({ court: i + 1, players: c, split: chooseSplit(c, hist, cfg) }));
  const matches: Match[] = diag.map((d) => ({ court: d.court, teamA: d.split.teamA, teamB: d.split.teamB }));
  return { round: { index: previousRounds.length + 1, matches, sitOuts }, courts: diag };
}

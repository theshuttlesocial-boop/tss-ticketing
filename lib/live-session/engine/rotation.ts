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
/* Hard rule — a strong never shares a court with a beginner            */
/* ------------------------------------------------------------------ */

/**
 * "Beginner" here is the beginner FLAG, not the registered level: the same flag
 * the court ceiling uses. It clears on promotion (rating above the session
 * median for `promotionRounds` rounds), after which the player has shown they
 * belong on a normal court.
 */
const isStrong = (p: Player) => p.level === 'strong';
const isBeg = (p: Player) => p.beginner;
const isMiddle = (p: Player) => !isStrong(p) && !isBeg(p);

/** True when a court holds both a strong and a flagged beginner. */
export function courtViolates(court: Player[]): boolean {
  return court.some(isStrong) && court.some(isBeg);
}

/**
 * Can the active players be laid out with every beginner on a strong-free
 * court? Beginners need ceil(b/4) strong-free courts, and those courts must be
 * filled from beginners plus middle (standard/intermediate) players.
 */
export function separable(active: Player[]): boolean {
  const b = active.filter(isBeg).length;
  if (b === 0) return true;
  const n = active.filter(isMiddle).length;
  return b + n >= 4 * Math.ceil(b / 4);
}

/**
 * Break sit-out TIES so strong + intermediate players fill whole courts.
 *
 * chooseSitOuts ranks by sit-outs so far and breaks ties at random. Among the
 * players tied at the cut-off, WHICH of them sits is arbitrary — so choosing
 * them to make the strong+intermediate count a multiple of four costs nothing
 * in fairness, and removes the court that would otherwise have to mix strongs
 * with standards.
 */
export function alignUpperGroup(players: Player[], sitOuts: PlayerId[], courts: number): PlayerId[] {
  const sit = new Set(sitOuts);
  const upper = (p: Player) => (p.level === 'strong' || p.level === 'intermediate') && !p.beginner;
  const eligible = players.filter((p) => !p.satLastRound);
  if (!sit.size) return sitOuts;
  // The cut-off is the highest sit-out count among those chosen to sit fairly.
  const cutoff = Math.max(...[...sit].map((id) => players.find((p) => p.id === id)!.sitOuts));
  const tied = eligible.filter((p) => p.sitOuts === cutoff);
  const upperOn = players.filter((p) => !sit.has(p.id) && upper(p)).length;
  const r = upperOn % 4;
  if (r === 0 || upperOn >= courts * 4) return sitOuts;

  const playingUpper = tied.filter((p) => !sit.has(p.id) && upper(p));
  const playingLower = tied.filter((p) => !sit.has(p.id) && !upper(p) && !p.beginner);
  const sittingUpper = tied.filter((p) => sit.has(p.id) && upper(p));
  const sittingLower = tied.filter((p) => sit.has(p.id) && !upper(p) && !p.beginner);

  // Commit to one direction that can FINISH, preferring the one with fewer
  // swaps. A half-done alignment gains nothing, so do neither if neither fits.
  const canDown = playingUpper.length >= r && sittingLower.length >= r;
  const canUp = sittingUpper.length >= 4 - r && playingLower.length >= 4 - r;
  const down = canDown && (!canUp || r <= 4 - r);
  if (!down && !canUp) return sitOuts;
  const n = down ? r : 4 - r;
  for (let i = 0; i < n; i++) {
    const out = down ? playingUpper[i] : playingLower[i];
    const inn = down ? sittingLower[i] : sittingUpper[i];
    sit.delete(inn.id); sit.add(out.id);
  }
  return [...sit];
}

/** How many more middle-or-beginner players the beginners' courts still need. */
export function separationDeficit(active: Player[]): number {
  const b = active.filter(isBeg).length;
  if (b === 0) return 0;
  const n = active.filter(isMiddle).length;
  return Math.max(0, 4 * Math.ceil(b / 4) - (b + n));
}

/**
 * Adjust sit-outs so the hard rule is achievable on court.
 *
 * Runs only when the fair sit-out choice leaves the beginners without enough
 * standard/intermediate players to fill a strong-free court. Tries swaps in
 * order of least disruption, applying the first that shrinks the deficit:
 *
 *   1. a sitting middle player comes on, a strong sits
 *   2. a sitting beginner comes on, a strong sits — two beginners can share
 *      one strong-free court with just two middles
 *   3. a playing beginner sits, a sitting non-beginner comes on
 *   4-5. as 1-3 but allowing someone to sit twice in a row. Only reached when
 *      the roster has almost no standard/intermediate players; the strong /
 *      beginner rule is treated as the harder of the two.
 */
export function repairSitOutsForSeparation(players: Player[], sitOuts: PlayerId[]): PlayerId[] {
  const sit = new Set(sitOuts);
  const active = () => players.filter((p) => !sit.has(p.id));
  const sitting = () => players.filter((p) => sit.has(p.id));
  const mostSat = (xs: Player[]) => [...xs].sort((a, b) => b.sitOuts - a.sitOuts);
  const leastSat = (xs: Player[]) => [...xs].sort((a, b) => a.sitOuts - b.sitOuts);

  const tryMove = (incoming: Player[], outgoing: Player[]): boolean => {
    const before = separationDeficit(active());
    for (const inP of incoming) {
      for (const outP of outgoing) {
        sit.delete(inP.id); sit.add(outP.id);
        if (separationDeficit(active()) < before) return true;
        sit.add(inP.id); sit.delete(outP.id);
      }
    }
    return false;
  };

  let guard = 0;
  while (separationDeficit(active()) > 0 && guard++ < players.length) {
    const fresh = (xs: Player[]) => xs.filter((p) => !p.satLastRound);
    const strongsOn = leastSat(active().filter(isStrong));
    const begsOn = leastSat(active().filter(isBeg));
    if (tryMove(mostSat(sitting().filter(isMiddle)), fresh(strongsOn))) continue;
    if (tryMove(mostSat(sitting().filter(isBeg)), fresh(strongsOn))) continue;
    if (tryMove(mostSat(sitting().filter((p) => !isBeg(p))), fresh(begsOn))) continue;
    if (tryMove(mostSat(sitting().filter((p) => !isStrong(p))), strongsOn)) continue;
    if (tryMove(mostSat(sitting().filter((p) => !isBeg(p))), begsOn)) continue;
    break; // roster cannot satisfy the rule; enforceSeparation reports it
  }
  return [...sit];
}

/**
 * Move players between courts until no court holds both a strong and a
 * beginner. Beginners stay on their courts wherever possible (the ceiling
 * already placed them); strongs are swapped out for the middle player whose
 * rating is closest, so both courts change as little as possible.
 */
export function enforceSeparation(courts: Player[][], cfg: RotationConfig): { courts: Player[][]; violations: number } {
  const out = courts.map((c) => [...c]);
  const allowed = new Set(cfg.beginnerCourts.map((c) => c - 1));
  let guard = 0;
  while (guard++ < 64) {
    const ci = out.findIndex(courtViolates);
    if (ci < 0) break;
    const strong = out[ci].filter(isStrong).sort((a, b) => a.rating - b.rating)[0];

    // Move A: swap the strong with a middle player from a beginner-free court.
    let best: { cj: number; pj: number; gap: number } | null = null;
    for (let cj = 0; cj < out.length; cj++) {
      if (cj === ci || out[cj].some(isBeg)) continue;
      out[cj].forEach((q, pj) => {
        if (!isMiddle(q)) return;
        const gap = Math.abs(q.rating - strong.rating);
        if (!best || gap < best.gap) best = { cj, pj, gap };
      });
    }
    if (best) {
      const { cj, pj } = best as { cj: number; pj: number };
      const si = out[ci].indexOf(strong);
      out[ci][si] = out[cj][pj];
      out[cj][pj] = strong;
      continue;
    }

    // Move B: move a beginner off this court onto a strong-free allowed court,
    // swapping with a middle player there.
    const beg = out[ci].find(isBeg)!;
    let moved = false;
    for (let cj = 0; cj < out.length && !moved; cj++) {
      if (cj === ci || !allowed.has(cj) || out[cj].some(isStrong)) continue;
      const pj = out[cj].findIndex(isMiddle);
      if (pj < 0) continue;
      const bi = out[ci].indexOf(beg);
      out[ci][bi] = out[cj][pj];
      out[cj][pj] = beg;
      moved = true;
    }
    if (!moved) break;
  }
  let result = out;
  // The greedy swaps above keep changes minimal but can dead-end — e.g. two
  // beginners on two different courts, each alongside strongs, with no
  // strong-free court to consolidate into. When the layout is achievable,
  // build it directly instead.
  if (result.some(courtViolates) && separable(result.flat())) result = constructSeparated(result);
  const violations = result.filter(courtViolates).length;
  return { courts: result.map((c) => c.sort((a, b) => b.rating - a.rating)), violations };
}

/**
 * Direct construction used only when greedy repair fails: beginners plus the
 * lowest-rated middle players fill the bottom ceil(b/4) courts; everyone else
 * fills the courts above in rating order. Always valid when separable().
 */
export function constructSeparated(courts: Player[][]): Player[][] {
  const all = courts.flat();
  const begs = all.filter(isBeg);
  const mids = all.filter(isMiddle).sort((a, b) => a.rating - b.rating);
  const k = Math.ceil(begs.length / 4);
  const fill = 4 * k - begs.length;
  const bottom = [...begs, ...mids.slice(0, fill)].sort((a, b) => b.rating - a.rating);
  const rest = [...all.filter(isStrong), ...mids.slice(fill)].sort((a, b) => b.rating - a.rating);
  const chunk = (xs: Player[]) => { const o: Player[][] = []; for (let i = 0; i < xs.length; i += 4) o.push(xs.slice(i, i + 4)); return o; };
  return [...chunk(rest), ...chunk(bottom)];
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
          if (courtViolates(upper) || courtViolates(lower)) continue;
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
  /** Courts still holding a strong and a beginner (only if the roster makes it unavoidable). */
  separationViolations: number;
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

  // Never more courts than there are full fours. With 13-15 players and 4
  // courts the old code built a court of 1-3 players and crashed.
  const courtsUsed = Math.min(cfg.courts, Math.floor(players.length / 4));
  if (courtsUsed < 1) throw new Error('need at least 4 players to draw a round');

  const fair = chooseSitOuts(players, courtsUsed, rand);
  const aligned = alignUpperGroup(players, fair, courtsUsed);
  const sitOuts = repairSitOutsForSeparation(players, aligned);
  const sitSet = new Set(sitOuts);
  const active = players.filter((p) => !sitSet.has(p.id));

  let courts = cutIntoCourts(active);
  courts = applyBeginnerCeiling(courts, cfg);
  courts = applyMovementCap(courts, hist, cfg);
  courts = applyBeginnerCeiling(courts, cfg); // cap pass must not undo the ceiling
  courts = neighbourSwap(courts, hist, cfg);
  // Hard rule last, so no later pass can undo it.
  const sep = enforceSeparation(courts, cfg);
  courts = sep.courts;

  const diag = courts.map((c, i) => ({ court: i + 1, players: c, split: chooseSplit(c, hist, cfg) }));
  const matches: Match[] = diag.map((d) => ({ court: d.court, teamA: d.split.teamA, teamB: d.split.teamB }));
  return { round: { index: previousRounds.length + 1, matches, sitOuts }, courts: diag, separationViolations: sep.violations };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makePlayer, chooseSitOuts, cutIntoCourts, applyBeginnerCeiling, chooseSplit, History, rng, isStrongWithBeginner, splitCost,
  DEFAULT_CONFIG, Player, Round, solveRound, splitsOf,
} from './engine';

const cfg = DEFAULT_CONFIG.rotation;
const mk = (id: string, rating: number, extra: Partial<Player> = {}): Player =>
  ({ ...makePlayer(id, id, 'standard'), rating, ...extra });

test('sit-outs: never two in a row, fewest sit-outs sit first', () => {
  const players: Player[] = [];
  for (let i = 1; i <= 28; i++) players.push(mk(`p${i}`, 1000, { sitOuts: i <= 12 ? 1 : 0, satLastRound: i <= 12 }));
  const sits = chooseSitOuts(players, 4, rng(3));
  assert.equal(sits.length, 12);
  assert.ok(sits.every((id) => Number(id.slice(1)) > 12), 'nobody who sat last round sits again');
});

test('sit-outs: fewest-sit-outs first with ties random (seeded)', () => {
  const players: Player[] = [];
  for (let i = 1; i <= 20; i++) players.push(mk(`p${i}`, 1000, { sitOuts: i <= 10 ? 0 : 2 }));
  const sits = chooseSitOuts(players, 4, rng(1));
  assert.equal(sits.length, 4);
  assert.ok(sits.every((id) => Number(id.slice(1)) <= 10), 'the players with fewest sit-outs sit');
});

test('cut into courts by rating: rank 1–4 → court 1', () => {
  const ps = Array.from({ length: 16 }, (_, i) => mk(`p${i + 1}`, 1000 + i * 10));
  const courts = cutIntoCourts(ps);
  assert.deepEqual(courts[0].map((p) => p.id), ['p16', 'p15', 'p14', 'p13']);
  assert.deepEqual(courts[3].map((p) => p.id), ['p4', 'p3', 'p2', 'p1']);
});

test('beginner ceiling: beginner on court 1 swaps with top non-beginner on courts 3–4', () => {
  const ps = Array.from({ length: 16 }, (_, i) => mk(`p${i + 1}`, 1000 + i * 10));
  ps[15] = { ...ps[15], beginner: true }; // highest-rated player is flagged
  const courts = applyBeginnerCeiling(cutIntoCourts(ps), cfg);
  assert.ok(!courts[0].some((p) => p.beginner) && !courts[1].some((p) => p.beginner));
  assert.ok(courts[2].some((p) => p.id === 'p16'), 'beginner dropped to court 3');
  assert.ok(courts[0].some((p) => p.id === 'p8'), 'top non-beginner from court 3 promoted to court 1');
});

test('pair split: skill-balanced (1&4 v 2&3) by default', () => {
  const court = [mk('a', 1100), mk('b', 1050), mk('c', 1000), mk('d', 950)];
  const s = chooseSplit(court, new History(), cfg);
  assert.deepEqual([s.teamA, s.teamB], [{ a: 'a', b: 'd' }, { a: 'b', b: 'c' }]);
});

test('pair split: a repeat partner (cost 3) beats a 100-point gap (cost 0.5)', () => {
  const court = [mk('a', 1100), mk('b', 1050), mk('c', 1000), mk('d', 950)];
  const hist = new History([{ index: 1, sitOuts: [], matches: [{ court: 1, teamA: { a: 'a', b: 'd' }, teamB: { a: 'b', b: 'c' } }] }]);
  const s = chooseSplit(court, hist, cfg);
  assert.notDeepEqual([s.teamA, s.teamB], [{ a: 'a', b: 'd' }, { a: 'b', b: 'c' }]);
  assert.equal(s.repeats > 0, true, 'opponent repeats are unavoidable with the same four');
});

test('solveRound: 28 players → 4 courts, 12 sit, all distinct', () => {
  const players: Record<string, Player> = {};
  for (let i = 1; i <= 28; i++) players[`p${i}`] = mk(`p${i}`, 1000 - i * 5, { beginner: i > 22 });
  const { round } = solveRound(players, [], cfg, 7);
  assert.equal(round.matches.length, 4);
  assert.equal(round.sitOuts.length, 12);
  const ids = round.matches.flatMap((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]).concat(round.sitOuts);
  assert.equal(new Set(ids).size, 28);
  for (const m of round.matches.slice(0, 2))
    for (const id of [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]) assert.ok(!players[id].beginner, `beginner ${id} on court ${m.court}`);
});

test('splitsOf lists exactly the three splits, balanced first', () => {
  const court = [mk('a', 4), mk('b', 3), mk('c', 2), mk('d', 1)];
  assert.equal(splitsOf(court).length, 3);
  assert.deepEqual(splitsOf(court)[0], [{ a: 'a', b: 'd' }, { a: 'b', b: 'c' }]);
});

// ── strong/beginner pairing + balance priority ────────────────────────────────

test('S,S,St,B court: the two rules conflict, and balance wins under default weights', () => {
  // Uses the REAL starting ratings. An earlier version of this test used the
  // pre-4-level ratings (1050/1000/900), under which the solver avoided the
  // strong+beginner pair — and so passed while the deployed config did not.
  //
  // With 1140/980/900 the only split without a strong+beginner pair is
  // S+S v St+B, a 200-point mismatch. Default weights prefer the 40-point
  // game with a strong partnering the beginner. Keeping strong and beginner
  // off the same court is the job of court assignment, not the split.
  const court = [
    { ...makePlayer('s1', 's1', 'strong') },
    { ...makePlayer('s2', 's2', 'strong') },
    { ...makePlayer('t1', 't1', 'standard') },
    { ...makePlayer('b1', 'b1', 'beginner') },
  ].sort((a, b) => b.rating - a.rating);
  const s = chooseSplit(court, new History([]), cfg);
  const r = (id: string) => court.find((p) => p.id === id)!.rating;
  const gap = Math.abs((r(s.teamA.a) + r(s.teamA.b)) / 2 - (r(s.teamB.a) + r(s.teamB.b)) / 2);
  assert.ok(gap <= 40, `expected the balanced split, got a ${gap}-point gap`);
});

test('isStrongWithBeginner detects the pairing in both orders', () => {
  const court = [
    mk('s1', 1050, { level: 'strong' }),
    mk('b1', 900, { level: 'beginner', beginner: true }),
    mk('t1', 1000, { level: 'standard' }),
    mk('t2', 1000, { level: 'standard' }),
  ];
  assert.equal(isStrongWithBeginner(court, { a: 's1', b: 'b1' }), true);
  assert.equal(isStrongWithBeginner(court, { a: 'b1', b: 's1' }), true);
  assert.equal(isStrongWithBeginner(court, { a: 's1', b: 't1' }), false);
  assert.equal(isStrongWithBeginner(court, { a: 'b1', b: 't1' }), false);
});

test('balance now outranks variety: a big team gap costs more than a repeat partner', () => {
  // Compare the two cost terms directly. With the same four players every
  // split shares most opponent repeats, so comparing whole splits confounds
  // the thing under test.
  const court = [mk('a', 1200), mk('b', 1190), mk('c', 810), mk('d', 800)];
  const empty = new History([]);
  const repeated = new History([
    { index: 1, sitOuts: [], matches: [{ court: 1, teamA: { a: 'a', b: 'd' }, teamB: { a: 'b', b: 'c' } }] },
  ]);

  // Balanced split (gap 0) carrying one repeated partnership.
  const balancedRepeat = splitCost(court, { a: 'a', b: 'd' }, { a: 'b', b: 'c' }, repeated, cfg);
  // Lopsided split (gap 390) with no repeats at all.
  const lopsidedFresh = splitCost(court, { a: 'a', b: 'b' }, { a: 'c', b: 'd' }, empty, cfg);

  assert.ok(lopsidedFresh.cost > balancedRepeat.cost,
    `a 390-point mismatch (${lopsidedFresh.cost.toFixed(1)}) should cost more than ` +
    `a repeated partnership (${balancedRepeat.cost.toFixed(1)})`);

  // And under the ORIGINAL weighting it was the other way round, which is
  // exactly the behaviour change.
  const oldCfg = { ...cfg, cost: { ...cfg.cost, per100Gap: 0.5 } };
  const oldLopsided = splitCost(court, { a: 'a', b: 'b' }, { a: 'c', b: 'd' }, empty, oldCfg);
  const oldBalanced = splitCost(court, { a: 'a', b: 'd' }, { a: 'b', b: 'c' }, repeated, oldCfg);
  assert.ok(oldLopsided.cost < oldBalanced.cost,
    'with per100Gap 0.5 the lopsided split was the cheaper option');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedShare, kFor, rateGame, makePlayer, applyPromotion, median, confidenceRating, DEFAULT_CONFIG, Player } from './engine';

const roster = (ratings: number[], beginners: number[] = []): Record<string, Player> => {
  const m: Record<string, Player> = {};
  ratings.forEach((r, i) => {
    const p = makePlayer(`p${i + 1}`, `P${i + 1}`, 'standard');
    m[p.id] = { ...p, rating: r, beginner: beginners.includes(i + 1) };
  });
  return m;
};
const game = (scoreA: number, scoreB: number) => ({ round: 1, court: 1, teamA: { a: 'p1', b: 'p2' }, teamB: { a: 'p3', b: 'p4' }, scoreA, scoreB });

test('expected share: 100-point gap = 60/40, clipped at [0.15, 0.85]', () => {
  assert.equal(expectedShare(1050, 950), 0.6);
  assert.equal(expectedShare(1000, 1000), 0.5);
  assert.equal(expectedShare(1500, 1000), 0.85);
  assert.equal(expectedShare(1000, 1500), 0.15);
});

test('K schedule 300/300/220/220/160/160…', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((g) => kFor(g)), [300, 300, 220, 220, 160, 160, 160]);
});

test('doc example: 21–5 vs equals = +92', () => {
  const { deltas } = rateGame(roster([1000, 1000, 1000, 1000]), game(21, 5));
  assert.equal(Math.round(deltas.p1), 92);
  assert.equal(deltas.p1, deltas.p2, 'partners get the same change');
  assert.equal(Math.round(deltas.p3), -92);
});

test('doc example: 21–5 vs a pair you were expected to crush = −13', () => {
  const { deltas } = rateGame(roster([1200, 1200, 800, 800]), game(21, 5));
  assert.equal(Math.round(deltas.p1), -13);
});

test('doc example: 22–24 loss to a pair 200 above you = +53', () => {
  const { deltas } = rateGame(roster([1000, 1000, 1200, 1200]), game(22, 24));
  assert.equal(Math.round(deltas.p1), 53);
});

test('doc example: same scoreline with a 900 partner earns ~4× a 1100 partner', () => {
  const weak = rateGame(roster([1000, 900, 1000, 1000]), game(21, 15)).deltas.p1;
  const strong = rateGame(roster([1000, 1100, 1000, 1000]), game(21, 15)).deltas.p1;
  assert.equal(Math.round(weak), 40);
  assert.equal(Math.round(strong), 10);
  assert.ok(weak / strong > 3.5 && weak / strong < 4.5);
});

test('doc example: no court multiplier — opponent strength carries it (+48 vs ≈+5)', () => {
  // A 1000-rated pair in their 3rd game (K=220), same 24–18 scoreline, different opponents.
  const withGames = (ps: Record<string, Player>) => Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, { ...p, games: 2 }]));
  const c1 = rateGame(withGames(roster([1000, 1000, 1150, 1150])), game(24, 18)).deltas.p1;
  const c4 = rateGame(withGames(roster([1000, 1000, 950, 950])), game(24, 18)).deltas.p1;
  assert.equal(Math.round(c1), 49); // doc says ≈ +48
  assert.equal(Math.round(c4), 5);
});

test('promotion: clears after 2 consecutive rounds above median, never re-applies', () => {
  let ps = roster([1100, 1000, 950, 850, 800], [1]); // p1 is a flagged beginner sitting above median
  assert.equal(median(Object.values(ps).map((p) => p.rating)), 950);
  ps = applyPromotion(ps);
  assert.equal(ps.p1.beginner, true, 'one round is not enough');
  ps = applyPromotion(ps);
  assert.equal(ps.p1.beginner, false, 'promoted after two');
  ps = { ...ps, p1: { ...ps.p1, rating: 700 } };
  ps = applyPromotion(ps);
  assert.equal(ps.p1.beginner, false, 'never re-applies');
});

test('confidence-adjusted rating shrinks toward 1000 for few games', () => {
  const p = { ...makePlayer('x', 'X', 'standard'), rating: 1200, games: 2 };
  assert.equal(confidenceRating(p), 1100); // 1000 + 200 × 2/4
  assert.equal(confidenceRating({ ...p, games: 8 }), 1160);
});

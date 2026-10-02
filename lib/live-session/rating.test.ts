import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedShare, kFor, rateGame, makePlayer, median, confidenceRating, DEFAULT_CONFIG, Player } from './engine';

const roster = (ratings: number[], beginners: number[] = []): Record<string, Player> => {
  const m: Record<string, Player> = {};
  ratings.forEach((r, i) => {
    const p = makePlayer(`p${i + 1}`, `P${i + 1}`, 'standard');
    m[p.id] = { ...p, rating: r, beginner: beginners.includes(i + 1) };
  });
  return m;
};
// The examples below are the v2 rating maths (before court weighting), pinned so
// they keep checking it exactly. v3's defaults are tested further down.
const V2 = { ...DEFAULT_CONFIG.rating, divisor: 1000, kSchedule: [300, 300, 220, 220, 160], courtWeight: null };
const game = (scoreA: number, scoreB: number) => ({ round: 1, court: 1, teamA: { a: 'p1', b: 'p2' }, teamB: { a: 'p3', b: 'p4' }, scoreA, scoreB });

test('expected share: 100-point gap = 60/40, clipped at [0.15, 0.85]', () => {
  assert.equal(expectedShare(1050, 950, V2), 0.6);
  assert.equal(expectedShare(1000, 1000, V2), 0.5);
  assert.equal(expectedShare(1500, 1000, V2), 0.85);
  assert.equal(expectedShare(1000, 1500, V2), 0.15);
});

test('K schedule 300/300/220/220/160/160…', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((g) => kFor(g, V2)), [300, 300, 220, 220, 160, 160, 160]);
});

test('doc example: 21–5 vs equals = +92', () => {
  const { deltas } = rateGame(roster([1000, 1000, 1000, 1000]), game(21, 5), V2);
  assert.equal(Math.round(deltas.p1), 92);
  assert.equal(deltas.p1, deltas.p2, 'partners get the same change');
  assert.equal(Math.round(deltas.p3), -92);
});

test('doc example: 21–5 vs a pair you were expected to crush = −13', () => {
  const { deltas } = rateGame(roster([1200, 1200, 800, 800]), game(21, 5), V2);
  assert.equal(Math.round(deltas.p1), -13);
});

test('doc example: 22–24 loss to a pair 200 above you = +53', () => {
  const { deltas } = rateGame(roster([1000, 1000, 1200, 1200]), game(22, 24), V2);
  assert.equal(Math.round(deltas.p1), 53);
});

test('doc example: same scoreline with a 900 partner earns ~4× a 1100 partner', () => {
  const weak = rateGame(roster([1000, 900, 1000, 1000]), game(21, 15), V2).deltas.p1;
  const strong = rateGame(roster([1000, 1100, 1000, 1000]), game(21, 15), V2).deltas.p1;
  assert.equal(Math.round(weak), 40);
  assert.equal(Math.round(strong), 10);
  assert.ok(weak / strong > 3.5 && weak / strong < 4.5);
});

test('v2 doc example: no court multiplier — opponent strength carries it (+48 vs ≈+5)', () => {
  // A 1000-rated pair in their 3rd game (K=220), same 24–18 scoreline, different opponents.
  const withGames = (ps: Record<string, Player>) => Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, { ...p, games: 2 }]));
  const c1 = rateGame(withGames(roster([1000, 1000, 1150, 1150])), game(24, 18), V2).deltas.p1;
  const c4 = rateGame(withGames(roster([1000, 1000, 950, 950])), game(24, 18), V2).deltas.p1;
  assert.equal(Math.round(c1), 49); // doc says ≈ +48
  assert.equal(Math.round(c4), 5);
});

test('median promotion is gone: the beginner flag follows the current level only', () => {
  // Level review (engine/review.ts) replaced "above the median for 2 rounds".
  let ps = roster([1100, 1000, 950, 850, 800], [1]);
  assert.equal(median(Object.values(ps).map((p) => p.rating)), 950);
  assert.equal(ps.p1.beginner, true);
});

test('confidence-adjusted rating shrinks toward 1000 for few games', () => {
  const p = { ...makePlayer('x', 'X', 'standard'), rating: 1200, games: 2 };
  assert.equal(confidenceRating(p), 1100); // 1000 + 200 × 2/4
  assert.equal(confidenceRating({ ...p, games: 8 }), 1160);
});

// ── v3 defaults: steeper expectation, gentler K, court-strength weighting ────
test('v3: a 100-point gap expects about 64/36', () => {
  assert.ok(Math.abs(expectedShare(1050, 950) - 0.6429) < 0.001);
});

test('v3: K schedule 220/220/160/160/120', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((g) => kFor(g)), [220, 220, 160, 160, 120, 120]);
});

test('v3: the same win counts for more against a strong pair than a weak one', () => {
  // Same two pairs of equals in each game, so Elo alone gives the same change;
  // only where they sit against the rest of the session differs.
  const field = (lvl: number) => ({ ...roster([lvl, lvl, lvl, lvl]),
    ...Object.fromEntries([1000, 1000, 1150, 1150, 1150, 1150, 950, 950].map((r, i) => [`f${i}`, { ...makePlayer(`f${i}`, `F${i}`, 'standard'), rating: r }])) });
  const top = rateGame(field(1150), game(21, 15)).deltas.p1;      // a top-court game
  const bottom = rateGame(field(950), game(21, 15)).deltas.p1;    // a bottom-court game
  assert.ok(top > bottom * 2, `top ${top.toFixed(1)} vs bottom ${bottom.toFixed(1)}`);
});

test('v3: a loss to a strong pair costs less than a loss to a weak pair', () => {
  const field = (lvl: number) => ({ ...roster([lvl, lvl, lvl, lvl]),
    ...Object.fromEntries([1000, 1000, 1150, 1150, 950, 950].map((r, i) => [`f${i}`, { ...makePlayer(`f${i}`, `F${i}`, 'standard'), rating: r }])) });
  const lossTop = rateGame(field(1150), game(15, 21)).deltas.p1;
  const lossBottom = rateGame(field(950), game(15, 21)).deltas.p1;
  assert.ok(lossTop < 0 && lossBottom < 0 && Math.abs(lossTop) < Math.abs(lossBottom));
});

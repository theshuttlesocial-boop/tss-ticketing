/**
 * Worked examples for the TSS Rating (v2). Each number is worked out by hand
 * in the comment, then checked against the engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATING_V2 } from './config';
import { confidenceIn, isNew, matchWeight, newPlayer, predictionAccuracy, rateGame, replayV2, volatility, winChance, RatedGame } from './engine';

const near = (a: number, b: number, m = '') => assert.ok(Math.abs(a - b) < 1e-6, `${m} ${a} ≠ ${b}`);
const g = (a: [string, string], b: [string, string], sa: number, sb: number, at = '2026-10-02T19:00:00Z', extra: Partial<RatedGame> = {}): RatedGame =>
  ({ teamA: a, teamB: b, scoreA: sa, scoreB: sb, at, ...extra });
const four = (levels: Record<string, any>) => Object.fromEntries(Object.entries(levels).map(([k, l]) => [k, newPlayer({ key: k, level: l })]));

test('example 1: four new Standards, 21–15. W = Opp = 500, p = 0.5, F = 0.5 → ±40 × 0.5 × 0.5 = ±10', () => {
  const r = rateGame(four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' }), g(['a', 'b'], ['c', 'd'], 21, 15), 0);
  near(r.deltas.a, 10); near(r.deltas.b, 10); near(r.deltas.c, -10); near(r.deltas.d, -10);
});

test('example 2: Strong 580 + Beginner 450 beat two Standards 21–15', () => {
  // Strong:   W = 0.6×580 + 0.4×450 = 528; Opp = 500; p = 0.5 + 28/150 = 0.68667; Δ = 40 × 0.31333 × 0.5 = +6.2667
  // Beginner: W = 0.6×450 + 0.4×580 = 502;            p = 0.51333;             Δ = 40 × 0.48667 × 0.5 = +9.7333
  // Standard: W = 500; Opp = (580+450)/2 = 515; p = 0.4; lost → Δ = 40 × −0.4 × 0.5 = −8
  const r = rateGame(four({ s: 'strong', b: 'beginner', x: 'standard', y: 'standard' }), g(['s', 'b'], ['x', 'y'], 21, 15), 0);
  near(r.deltas.s, 6.266666667, 'strong'); near(r.deltas.b, 9.733333333, 'beginner'); near(r.deltas.x, -8, 'standard');
});

test('example 3: a 75+ point edge gains nothing for winning (p = 1)', () => {
  assert.equal(winChance(575, 500), 1);
  const r = rateGame({ ...four({ a: 'strong', b: 'strong', c: 'standard', d: 'standard' }),
    a: { ...newPlayer({ key: 'a', level: 'strong' }), rating: 600 }, b: { ...newPlayer({ key: 'b', level: 'strong' }), rating: 600 },
    c: { ...newPlayer({ key: 'c', level: 'beginner' }), rating: 450 }, d: { ...newPlayer({ key: 'd', level: 'beginner' }), rating: 450 } },
    g(['a', 'b'], ['c', 'd'], 21, 5), 0);
  near(r.deltas.a, 0); near(r.deltas.c, 0);
});

test('example 4: a game won by 2 or fewer counts a quarter: equal teams 21–19 → ±40 × 0.5 × 0.25 = ±5', () => {
  assert.equal(matchWeight(g(['a', 'b'], ['c', 'd'], 21, 19)), 0.25);
  const r = rateGame(four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' }), g(['a', 'b'], ['c', 'd'], 21, 19), 0);
  near(r.deltas.a, 5); near(r.deltas.d, -5);
});

test('example 5: timed draw between equals changes nothing; final = 0.5, social = 0', () => {
  const r = rateGame(four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' }), g(['a', 'b'], ['c', 'd'], 15, 15), 0);
  near(r.deltas.a, 0);
  assert.equal(matchWeight(g(['a', 'b'], ['c', 'd'], 21, 10, undefined, { kind: 'final' })), 0.5);
  assert.equal(matchWeight(g(['a', 'b'], ['c', 'd'], 21, 10, undefined, { kind: 'social' })), 0);
});

test('example 6: volatility M = 40 to 20 games, 32 at 30 games, 20 from 45 games; 40 again after a long break', () => {
  near(volatility(20, false), 40); near(volatility(30, false), 32); near(volatility(45, false), 20); near(volatility(80, false), 20);
  near(volatility(80, true), 40);
});

test('example 7: confidence 0.2 new, 0.6 at 10 games, 1 at 20+; C is the average of the other three', () => {
  near(confidenceIn(0), 0.2); near(confidenceIn(10), 0.6); near(confidenceIn(20), 1); near(confidenceIn(50), 1);
  // After bootstrap: partner 20 games, opponents 0 and 10 → C = (1 + 0.2 + 0.6)/3 = 0.6 → equal-rated win 21–15: 40 × 0.5 × 0.6 × 0.5 = 6
  const at = '2026-10-02T19:00:00Z', past = (n: number) => Array.from({ length: n }, () => '2026-09-01T19:00:00Z');
  const P = four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' });
  P.a.playedAt = past(5); P.b.playedAt = past(20); P.c.playedAt = []; P.d.playedAt = past(10);
  near(rateGame(P, g(['a', 'b'], ['c', 'd'], 21, 15, at), RATING_V2.bootstrapGames).deltas.a, 6);
  near(rateGame(P, g(['a', 'b'], ['c', 'd'], 21, 15, at), 10).deltas.a, 10, 'bootstrap: C = 1');
});

test('example 8: never below 400 — a 402 player losing 10 points ends on 400', () => {
  // All four at 402: equal, 21–15 loss → Δ = −10, floored at 400.
  const r = replayV2(['a', 'b', 'c', 'd'].map((key) => ({ key, level: 'beginner' as const, startOverride: 402 })),
    [g(['a', 'b'], ['c', 'd'], 15, 21)]);
  near(r.players.a.rating, 400); near(r.players.c.rating, 412);
});

test('losing streaks level off: the more you are expected to lose, the less each loss costs', () => {
  const games = Array.from({ length: 40 }, (_, i) => g(['b1', 'b2'], ['s1', 's2'], 0, 21, `2026-10-02T19:${String(i).padStart(2, '0')}:00Z`));
  const r = replayV2([{ key: 'b1', level: 'beginner' }, { key: 'b2', level: 'beginner' }, { key: 's1', level: 'standard' }, { key: 's2', level: 'standard' }], games);
  const gap = r.players.s1.rating - r.players.b1.rating;
  assert.ok(gap <= 75 + 1e-6, `gap stops at the 75-point "certain win" edge: ${gap.toFixed(1)}`);
});

test('example 9: back after 120+ days, M is 40 again for 5 games', () => {
  const early = Array.from({ length: 30 }, (_, i) => g(['a', 'b'], ['c', 'd'], 21, 21 - 5, `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T10:${String(i).padStart(2, '0')}:00Z`));
  const r = replayV2([], [...early, g(['a', 'b'], ['c', 'd'], 21, 15, '2026-06-01T19:00:00Z')]);
  assert.equal(r.players.a.boostLeft, 4, 'one boosted game used, four left');
});

test('example 10: point-share mode — equal teams 21–15: S = 21/36; Δ = 40 × (0.58333 − 0.5) × 0.5 = +1.6667', () => {
  const r = rateGame(four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' }), g(['a', 'b'], ['c', 'd'], 21, 15), 0, { ...RATING_V2, outcome: 'point_share' });
  near(r.deltas.a, 1.666666667);
});

test('example 11: an unknown substitute’s game leaves that player alone; New until 5 games', () => {
  const r = rateGame(four({ a: 'standard', b: 'standard', c: 'standard', d: 'standard' }), g(['a', 'b'], ['c', 'd'], 21, 15, undefined, { unrated: ['a'] }), 0);
  assert.equal(r.deltas.a, undefined); near(r.deltas.b, 10);
  assert.ok(isNew(newPlayer({ key: 'x', level: 'standard' }), '2026-10-02T19:00:00Z'));
});

test('prediction accuracy counts the favourite winning, skipping even games', () => {
  const r = replayV2([{ key: 's', level: 'strong' }, { key: 't', level: 'strong' }, { key: 'b', level: 'beginner' }, { key: 'c', level: 'beginner' }],
    [g(['s', 't'], ['b', 'c'], 21, 10, '2026-10-02T19:00:00Z'), g(['s', 't'], ['b', 'c'], 12, 21, '2026-10-02T19:10:00Z')]);
  const acc = predictionAccuracy(r.games);
  assert.equal(acc.games, 2); assert.equal(acc.right, 1);
});

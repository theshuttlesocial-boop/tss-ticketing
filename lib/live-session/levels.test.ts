/**
 * Mid-session level changes (Fix 3) and automatic level review (Fix 4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandBounds, bandOf, changeLevel, correctStartLevel, createSession, DEFAULT_CONFIG, flagGames,
  GameResult, Level, ratingImpact, recomputeRatings, reviewLevels, Session,
} from './engine';

const S = DEFAULT_CONFIG.rating.start;

test('bands: boundaries are halfway between starting ratings', () => {
  assert.deepEqual(bandBounds('beginner', S), [-Infinity, 940]);
  assert.deepEqual(bandBounds('standard', S), [940, 1020]);
  assert.deepEqual(bandBounds('intermediate', S), [1020, 1100]);
  assert.deepEqual(bandBounds('strong', S), [1100, Infinity]);
  assert.equal(bandOf(939.9, S), 'beginner');
  assert.equal(bandOf(940, S), 'standard');
  assert.equal(bandOf(1019, S), 'standard');
  assert.equal(bandOf(1100, S), 'strong');
});

/** Four players: `x` plus three fixed opponents/partners; `x` wins every game by `score`. */
function session(level: Level, rounds: number, score: [number, number], extra: Partial<Session['config']> = {}) {
  const roster = [
    { id: 'x', name: 'X', level },
    { id: 'a', name: 'A', level: 'standard' as Level },
    { id: 'b', name: 'B', level: 'standard' as Level },
    { id: 'c', name: 'C', level: 'standard' as Level },
  ];
  const s = createSession(roster, { ...DEFAULT_CONFIG, ...extra } as any, 1);
  const results: GameResult[] = [];
  for (let r = 1; r <= rounds; r++) {
    results.push({ round: r, court: 1, teamA: { a: 'x', b: 'a' }, teamB: { a: 'b', b: 'c' }, scoreA: score[0], scoreB: score[1] });
  }
  return recomputeRatings({ ...s, results });
}

test('review: needs minGames played before anyone moves', () => {
  const s = session('standard', 2, [21, 5]);
  assert.ok(s.players.x.rating > 1100, 'rating is already strong-band');
  assert.equal(reviewLevels(s).length, 0, 'but only 2 games');
});

test('review: moves one step at a time, from the next draw', () => {
  const s = session('standard', 3, [21, 5]);
  const [p] = reviewLevels(s).filter((x) => x.playerId === 'x');
  assert.equal(p.to, 'intermediate', 'one step, even though the rating is in the strong band');
  const moved = changeLevel(s, 'x', p.to, 4, 'system');
  assert.equal(moved.players.x.level, 'intermediate');
  // Nothing more until two more rounds have been played at the new level.
  assert.equal(reviewLevels(moved).filter((x) => x.playerId === 'x').length, 0);
});

test('review: hysteresis — the rating must be far enough inside the new band', () => {
  const s = session('standard', 3, [21, 5]);
  const inside = s.players.x.rating - bandBounds('intermediate', S)[0]; // how far inside it is
  const withMargin = (h: number) => ({ ...s, config: { ...s.config, levels: { ...s.config.levels, hysteresis: h } } });
  assert.equal(reviewLevels(withMargin(inside - 1)).filter((x) => x.playerId === 'x').length, 1, 'just enough: moves');
  assert.equal(reviewLevels(withMargin(inside + 1)).filter((x) => x.playerId === 'x').length, 0, 'not quite: stays');
});

test('review: must be in the other band for 2 rounds in a row', () => {
  const s = session('standard', 3, [21, 5]);
  // Rewrite round 2 as a loss: the band after round 2 is back to standard.
  const results = s.results.map((g) => (g.round === 2 ? { ...g, scoreA: 5, scoreB: 21 } : g));
  const t = recomputeRatings({ ...s, results });
  assert.equal(reviewLevels(t).filter((x) => x.playerId === 'x').length, 0);
});

test('review: locked players are never moved', () => {
  const s = session('standard', 4, [21, 5]);
  const locked = { ...s, players: { ...s.players, x: { ...s.players.x, levelLocked: true } } };
  assert.equal(reviewLevels(locked).filter((x) => x.playerId === 'x').length, 0);
});

test('review: games an unknown substitute played are excluded', () => {
  const s = session('standard', 4, [21, 5]);
  const results = s.results.map((g) => (g.round >= 2 ? { ...g, unrated: ['x'] } : g));
  const t = recomputeRatings({ ...s, results });
  assert.equal(t.players.x.games, 1, 'only one rated game left');
  assert.equal(reviewLevels(t).filter((x) => x.playerId === 'x').length, 0);
});

test('review: suggest-only mode, except moves down to beginner', () => {
  const up = session('standard', 4, [21, 5], { levels: { ...DEFAULT_CONFIG.levels, autoApply: false } });
  assert.equal(reviewLevels(up).find((x) => x.playerId === 'x')!.auto, false);
  const down = session('standard', 4, [3, 21], { levels: { ...DEFAULT_CONFIG.levels, autoApply: false } });
  const p = reviewLevels(down).find((x) => x.playerId === 'x')!;
  assert.equal(p.to, 'beginner');
  assert.equal(p.auto, true, 'moving down to beginner always applies');
});

test('level change mid-session: earlier games stay as played, rating lifted to the new start', () => {
  const s = session('standard', 3, [21, 19]);
  const before = s.players.x.history.slice();
  const moved = changeLevel(s, 'x', 'strong', 4, 'admin');
  assert.deepEqual(moved.players.x.history, before, 'games 1-3 re-rated identically');
  assert.equal(moved.players.x.rating, Math.max(s.players.x.rating, S.strong));
  // Opponents are untouched: nothing after the change has been played yet.
  for (const id of ['a', 'b', 'c']) assert.equal(moved.players[id].rating, s.players[id].rating);
  // Moving down caps at the new start.
  const down = changeLevel(s, 'x', 'beginner', 4, 'admin');
  assert.equal(down.players.x.rating, Math.min(s.players.x.rating, S.beginner));
  assert.equal(down.players.x.beginner, true);
});

test('level change replays: a later score correction keeps the adjustment in order', () => {
  let s = session('standard', 2, [21, 19]);
  s = changeLevel(s, 'x', 'strong', 3, 'admin');
  s = recomputeRatings({ ...s, results: [...s.results,
    { round: 3, court: 1, teamA: { a: 'x', b: 'a' }, teamB: { a: 'b', b: 'c' }, scoreA: 10, scoreB: 21 }] });
  // Game 3 was played from the lifted 1140, so it starts there.
  assert.ok(s.players.x.history[1] < S.strong && s.players.x.history[2] < S.strong);
  const again = recomputeRatings(s);
  assert.equal(again.players.x.rating, s.players.x.rating, 'replay is stable');
});

test('correct starting level: rewrites from game 1 and reports whose ratings change', () => {
  const s = session('standard', 3, [21, 19]);
  const fixed = correctStartLevel(s, 'x', 'strong');
  assert.equal(fixed.players.x.startLevel, 'strong');
  assert.equal(fixed.players.x.level, 'strong');
  const impact = ratingImpact(s, fixed);
  assert.ok(impact.some((i) => i.id === 'x'));
  assert.ok(impact.some((i) => i.id === 'b'), 'opponents move too — which is why it asks first');
});

test('mismatch flags: a 12+ margin is flagged and names a likely cause', () => {
  const s = session('standard', 3, [21, 5]);
  const flags = flagGames(s);
  assert.ok(flags.length >= 1);
  assert.equal(flags[0].cause?.playerId, 'x');
});

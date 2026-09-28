/**
 * Regression tests replaying Session 88 (24 Sep) from fixtures/session-88.json.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, recomputeRatings, solveRound, courtViolates, Player } from './engine';
import { loadFixture, fixtureConfig, fixtureResults, fixtureRounds, stateBefore, drawPool, pid } from './fixtures';

const f = loadFixture('session-88.json');

test('session 88: replaying the results reproduces every final rating (±1)', () => {
  const cfg = fixtureConfig(f);
  const players: Record<string, Player> = {};
  f.players.forEach((p, i) => { players[pid(i)] = makePlayer(pid(i), p.name, p.level, cfg.rating); });
  const s = recomputeRatings({ config: cfg, players, rounds: fixtureRounds(f), results: fixtureResults(f), seed: 1 });
  for (const [name, want] of Object.entries(f.expectedFinalRatings)) {
    const got = Object.values(s.players).find((p) => p.name === name)!.rating;
    assert.ok(Math.abs(got - want) <= 1, `${name}: ${got.toFixed(1)} vs ${want}`);
  }
});

test('session 88: the stored draws broke the strong/beginner rule in rounds 2, 6 and 9', () => {
  const bad = fixtureRounds(f).filter((r) => r.matches.some((m) => {
    const lv = [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].map((id) => f.players[Number(id.slice(1))].level);
    return lv.includes('strong') && lv.includes('beginner');
  })).map((r) => r.index);
  assert.deepEqual(bad, [2, 6, 9]);
});

test('session 88: the current engine, same sit-outs and ratings, never puts a strong with a beginner', () => {
  for (const r of fixtureRounds(f)) {
    const s = stateBefore(f, r.index);
    const out = solveRound(drawPool(f, s, r.index), s.rounds, s.config.rotation, 1, r.sitOuts);
    assert.equal(out.separationViolations, 0, `round ${r.index}`);
    for (const c of out.courts) assert.ok(!courtViolates(c.players), `round ${r.index} court ${c.court}`);
  }
});

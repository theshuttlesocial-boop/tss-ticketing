/**
 * Regression tests replaying Session 89 (25 Sep) from fixtures/session-89.json.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, recomputeRatings, solveRound, courtViolates, Config, Player } from './engine';
import {
  loadFixture, fixtureConfig, fixtureResults, fixtureRounds, stateBefore, drawPool, pid,
} from './fixtures';

const f = loadFixture('session-89.json');
const JOE = pid(7), NIKESH = pid(15);

const pairsOf = (m: { teamA: { a: string; b: string }; teamB: { a: string; b: string } }) =>
  [[m.teamA.a, m.teamA.b].sort().join('+'), [m.teamB.a, m.teamB.b].sort().join('+')].sort().join(' v ');

function redraw(round: number, config: Config) {
  const s = stateBefore(f, round, config);
  const pool = drawPool(f, s, round);
  const sit = fixtureRounds(f).find((r) => r.index === round)!.sitOuts;
  return { s, pool, out: solveRound(pool, s.rounds, config.rotation, 1, sit) };
}

test('session 89: replaying the results reproduces every stored rating', () => {
  const cfg = fixtureConfig(f);
  const players: Record<string, Player> = {};
  f.players.forEach((p, i) => { players[pid(i)] = makePlayer(pid(i), p.name, p.level, cfg.rating); });
  const s = recomputeRatings({ config: cfg, players, rounds: fixtureRounds(f), results: fixtureResults(f), seed: 1 });
  for (const [name, want] of Object.entries(f.expectedFinalRatings)) {
    const got = Object.values(s.players).find((p) => p.name === name)!.rating;
    assert.ok(Math.abs(got - want) <= 1, `${name}: ${got.toFixed(1)} vs ${want}`);
  }
});

test('session 89: migrated level history (recorded, no adjustment) still reproduces every rating', () => {
  // How migration 011 stores the night: start level = level at the end, the two
  // admin edits recorded with adjust:false so history is kept but not re-rated.
  const cfg = fixtureConfig(f);
  const players: Record<string, Player> = {};
  f.players.forEach((p, i) => {
    const edits = (f.levelHistory ?? []).filter((h) => h.player === i);
    players[pid(i)] = {
      ...makePlayer(pid(i), p.name, p.level, cfg.rating),
      registeredLevel: edits[0]?.from ?? p.level,
      levelChanges: edits.map((h) => ({ from: h.from, to: h.to, beforeRound: h.changedBeforeRound, by: 'admin' as const, adjust: false })),
    };
  });
  const s = recomputeRatings({ config: cfg, players, rounds: fixtureRounds(f), results: fixtureResults(f), seed: 1 });
  for (const [name, want] of Object.entries(f.expectedFinalRatings)) {
    const got = Object.values(s.players).find((p) => p.name === name)!.rating;
    assert.ok(Math.abs(got - want) <= 1, `${name}: ${got.toFixed(1)} vs ${want}`);
  }
});

test('session 89: with the settings it ran on, every court of rounds 1-8 replays exactly', () => {
  // Swap limits and lone-beginner pairing switched off = the engine of 25 Sep.
  const base = fixtureConfig(f);
  const legacy: Config = { ...base, rotation: { ...base.rotation, maxSwapDistance: null, maxSwapGapIncrease: null, loneBeginnerPairing: false } };
  let courts = 0;
  for (const r of fixtureRounds(f).filter((x) => x.index <= 8)) {
    const { out } = redraw(r.index, legacy);
    for (const m of r.matches) {
      assert.equal(pairsOf(out.round.matches.find((x) => x.court === m.court)!), pairsOf(m), `R${r.index} C${m.court}`);
      courts++;
    }
  }
  assert.equal(courts, 32);
});

test('session 89: level edits are what put Nikesh on the beginners\' court in R2', () => {
  const { s } = redraw(2, fixtureConfig(f));
  assert.equal(s.players[NIKESH].level, 'beginner');
  assert.equal(stateBefore(f, 4).players[NIKESH].level, 'intermediate');
  assert.equal(stateBefore(f, 5).players[JOE].level, 'standard');
  assert.equal(stateBefore(f, 6).players[JOE].level, 'intermediate');
});

for (const round of [4, 6, 8]) {
  test(`session 89: re-drawing R${round} keeps everyone within one court of their block`, () => {
    const { out } = redraw(round, fixtureConfig(f));
    const courts = out.courts.map((c) => c.players);
    const ranked = courts.flat().sort((a, b) => b.rating - a.rating);
    const block = new Map(ranked.map((p, i) => [p.id, Math.ceil((i + 1) / 4)]));
    courts.forEach((c, ci) => {
      for (const p of c) {
        assert.ok(Math.abs(ci + 1 - block.get(p.id)!) <= 1,
          `${p.name} (#${ranked.indexOf(p) + 1}) on court ${ci + 1}, block ${block.get(p.id)}`);
      }
      assert.ok(!courtViolates(c), `R${round} court ${ci + 1} has a strong and a beginner`);
    });
    assert.equal(out.separationViolations, 0);
    if (round === 6) {
      const begCourt = courts.findIndex((c) => c.filter((p) => p.beginner).length >= 3);
      assert.ok(begCourt >= 0, 'three beginners play R6');
      assert.ok(!courts[begCourt].some((p) => p.id === JOE), 'Joe is not on the beginners\' court');
    }
  });
}

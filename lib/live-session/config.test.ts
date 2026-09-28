import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, serverKeys } from './config';
import { DEFAULT_CONFIG, normaliseConfig } from './engine';

test('config: built from DEFAULT_CONFIG; unknown and stale keys are ignored', () => {
  // A copied Session 88 config: old weights and extra junk.
  const c = buildConfig({ foo: 1, rotation: { cost: { junk: 9 } }, withdrawn: ['x'], registrationOpen: false });
  assert.deepEqual(c, DEFAULT_CONFIG);
  assert.equal((c as any).withdrawn, undefined, 'server-owned keys never come from the browser');
});

test('config: allowed overrides apply', () => {
  const c = buildConfig({ courts: 5, rotation: { maxSwapGapIncrease: 40, cost: { per100Gap: 2 } }, levels: { autoApply: false } });
  assert.equal(c.rotation.courts, 5);
  assert.equal(c.rotation.maxSwapGapIncrease, 40);
  assert.equal(c.rotation.cost.per100Gap, 2);
  assert.equal(c.rotation.cost.repeatPartner, DEFAULT_CONFIG.rotation.cost.repeatPartner);
  assert.equal(c.levels.autoApply, false);
});

test('config: bad values are rejected with the setting named', () => {
  assert.throws(() => buildConfig({ courts: 0 }), /courts/);
  assert.throws(() => buildConfig({ rating: { start: { beginner: 1000, standard: 990 } } }), /rise/);
  assert.throws(() => buildConfig({ levels: { minGames: 'three' } }), /minimum games/);
});

test('config: server-owned keys are carried over by serverKeys', () => {
  assert.deepEqual(serverKeys({ withdrawn: ['a'], finalRound: 9, per100Gap: 1 }), { withdrawn: ['a'], finalRound: 9 });
});

test('config: normaliseConfig fills keys an old session predates, keeps what it stored', () => {
  const old = { rating: { start: { beginner: 900, standard: 1000, strong: 1050 } }, rotation: { courts: 4, cost: { per100Gap: 0.5 } } };
  const n = normaliseConfig(old);
  assert.equal(n.rotation.cost.per100Gap, 0.5);
  assert.equal(n.rating.start.standard, 1000);
  assert.equal(n.rating.start.intermediate, DEFAULT_CONFIG.rating.start.intermediate);
  assert.equal(n.levels.minGames, DEFAULT_CONFIG.levels.minGames);
});

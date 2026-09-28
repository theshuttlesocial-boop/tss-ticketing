import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookieName, generatePin, hashPin, nameKey, playerCookie, validPin, verifyPin } from './pin';

test('pin: four digits, leading zeros kept', () => {
  for (let i = 0; i < 200; i++) assert.match(generatePin(), /^\d{4}$/);
  assert.ok(validPin('0042'));
  assert.ok(!validPin('42') && !validPin('12345') && !validPin('12a4') && !validPin(1234));
});

test('pin: only a salted hash is stored, and it verifies', () => {
  const h = hashPin('4821');
  assert.ok(!h.includes('4821'));
  assert.notEqual(h, hashPin('4821'), 'salted: same PIN, different hash');
  assert.ok(verifyPin('4821', h));
  assert.ok(!verifyPin('4822', h));
  assert.ok(!verifyPin('4821', null), 'no PIN on file never matches');
  assert.ok(!verifyPin('4821', 'garbage'));
});

test('pin: cookie is per session, httpOnly, lax, 12 hours', () => {
  const c = playerCookie('7bcd30af-8b4a-4f16-8faf-5ca13ef13596', 'p1', true);
  assert.equal(c.name, cookieName('7bcd30af-8b4a-4f16-8faf-5ca13ef13596'));
  assert.match(c.name, /^tss_live_[0-9a-f]{32}$/);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'lax');
  assert.equal(c.maxAge, 12 * 3600);
});

test('pin: names match regardless of case and spacing', () => {
  assert.equal(nameKey('  Joe   Suganthan '), nameKey('joe suganthan'));
});

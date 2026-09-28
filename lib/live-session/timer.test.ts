import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTimer, clockOffset, fmt, IDLE, remaining, shortcutUrl, timerStatus } from './timer';

const T0 = Date.parse('2026-10-02T19:00:00Z');
const s = (n: number) => T0 + n * 1000;

test('timer: start counts down from the server start time', () => {
  const t = applyTimer(IDLE, { action: 'start', seconds: 480 }, s(0));
  assert.equal(timerStatus(t), 'running');
  assert.equal(remaining(t, s(0)), 480);
  assert.equal(remaining(t, s(100)), 380);
  assert.equal(remaining(t, s(600)), 0, 'never negative');
});

test('timer: pause freezes, resume continues from where it was', () => {
  let t = applyTimer(IDLE, { action: 'start', seconds: 480 }, s(0));
  t = applyTimer(t, { action: 'pause' }, s(100));
  assert.equal(timerStatus(t), 'paused');
  assert.equal(remaining(t, s(1000)), 380, 'a paused timer does not move');
  t = applyTimer(t, { action: 'resume' }, s(1000));
  assert.equal(remaining(t, s(1080)), 300);
});

test('timer: +1 min works running, paused and after it has ended', () => {
  let t = applyTimer(IDLE, { action: 'start', seconds: 480 }, s(0));
  assert.equal(remaining(applyTimer(t, { action: 'add', seconds: 60 }, s(100)), s(100)), 440);
  const p = applyTimer(applyTimer(t, { action: 'pause' }, s(100)), { action: 'add', seconds: 60 }, s(200));
  assert.equal(remaining(p, s(999)), 440);
  t = applyTimer(t, { action: 'add', seconds: 60 }, s(900)); // ended at 480
  assert.equal(remaining(t, s(900)), 60, 'restarts with a minute');
  assert.equal(applyTimer(IDLE, { action: 'add', seconds: 60 }, s(0)), IDLE, 'no-op when idle');
});

test('timer: reset and bad input', () => {
  const t = applyTimer(IDLE, { action: 'start', seconds: 480 }, s(0));
  assert.equal(timerStatus(applyTimer(t, { action: 'reset' }, s(5))), 'idle');
  assert.throws(() => applyTimer(IDLE, { action: 'start', seconds: 5 }, s(0)));
  assert.throws(() => applyTimer(t, { action: 'add', seconds: 99999 }, s(0)));
});

test('timer: a phone with a wrong clock still shows the right time', () => {
  // Phone is 7 s fast. Request sent at phone time P, 200 ms round trip.
  const P = s(10) + 7000;
  const off = clockOffset(s(10) + 100, P, P + 200);
  assert.equal(off, -7000);
  const t = applyTimer(IDLE, { action: 'start', seconds: 480 }, s(0));
  assert.equal(Math.round(remaining(t, P + 100 + off)!), 470);
});

test('timer: display and iPhone shortcut link', () => {
  assert.equal(fmt(479.2), '08:00');
  assert.equal(fmt(59), '00:59');
  assert.equal(fmt(null), '--:--');
  assert.equal(shortcutUrl(480), 'shortcuts://run-shortcut?name=TSS%20Round&input=text&text=8');
});

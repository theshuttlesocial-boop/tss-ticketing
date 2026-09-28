import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLine } from './changeLog';

test('change log: level change reads as the brief asks', () => {
  assert.equal(
    describeLine({ round: 6, court: null, event: 'level', actor: 'admin', detail: { name: 'Joe Suganthan', from: 'standard', to: 'intermediate' } }),
    'Before R6 · Admin · Joe Suganthan Standard → Intermediate');
});

test('change log: system moves, scores, substitutes and session events', () => {
  assert.equal(
    describeLine({ round: 6, court: null, event: 'level', actor: 'system', detail: { name: 'Khairul', from: 'intermediate', to: 'strong' } }),
    'Before R6 · System · Khairul Intermediate → Strong');
  assert.equal(describeLine({ round: 3, court: 2, event: 'score', old_a: 21, old_b: 15, new_a: 15, new_b: 21 }),
    'R3 C2 · Admin · Score changed 21–15 → 15–21');
  assert.equal(describeLine({ round: 6, court: 3, event: 'override', detail: { from: 'Vikaash', to: 'Sam', pastGame: true } }),
    'R6 C3 · Admin · Played by someone else: Sam played for Vikaash');
  assert.equal(describeLine({ round: null, court: null, event: 'finish', actor: 'system' }),
    'Session · System · Session finished, registration closed');
});

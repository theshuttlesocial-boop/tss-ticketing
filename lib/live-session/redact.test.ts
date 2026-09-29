import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLevel, createSession, DEFAULT_CONFIG, nextRound, recordScore } from './engine';
import { redactSession, playerView } from './redact';

test('redact: no level, rating or level-review data reaches the public', () => {
  let s = createSession(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, level: i < 4 ? 'beginner' as const : 'strong' as const })), DEFAULT_CONFIG, 3);
  s = nextRound(s);
  for (const m of s.rounds[0].matches) s = recordScore(s, 1, m.court, 21, 15);
  s = changeLevel(s, 'p0', 'standard', 2, 'system', 'After 1 games (rating 950)');
  s = { ...s, players: { ...s.players, p1: { ...s.players.p1, accountId: 'acct-1' } } };
  s = { ...s, config: { ...s.config, dismissed: ['x'], blockedMoves: ['p0:standard'] } as any };
  const pub = JSON.stringify(redactSession(s));
  for (const leak of ['accountId', 'level', 'rating', 'beginner', 'strong', 'startLevel', 'registeredLevel', 'levelChanges', 'levelLocked', 'blockedMoves', 'dismissed', 'After 1 games']) {
    assert.ok(!pub.includes(leak), `public session leaks "${leak}"`);
  }
  const mine = playerView(s, 'p0')!;
  assert.ok(!JSON.stringify(mine.players).includes('rating'), 'other players stay name-only');
});

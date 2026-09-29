import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, publicName, SessionInput } from './history';

const g = (round: number, a: [string, string], b: [string, string], sa: number, sb: number, unrated?: string[]) =>
  ({ round, court: 1, teamA: { a: a[0], b: a[1] }, teamB: { a: b[0], b: b[1] }, scoreA: sa, scoreB: sb, ...(unrated ? { unrated } : {}) });

const s1: SessionInput = {
  sessionId: 's1', name: 'Session 90', date: '2026-10-02T18:00:00Z', me: 'm1', myRating: 1010, myStart: 980,
  games: [
    g(1, ['m1', 'p'], ['x', 'y'], 21, 15),
    g(2, ['x', 'z'], ['m1', 'p'], 18, 21),
    g(3, ['m1', 'x'], ['y', 'z'], 10, 21),
    g(4, ['a', 'b'], ['x', 'y'], 21, 5), // not me
    g(5, ['m1', 'y'], ['p', 'z'], 21, 21),
    g(6, ['m1', 'p'], ['x', 'z'], 21, 3, ['m1']), // a substitute played for me
  ],
  people: {
    m1: { name: 'Me Myself', accountId: 'ME' }, p: { name: 'Pat Partner', accountId: 'P' },
    x: { name: 'Xavi X', accountId: null }, y: { name: 'Yas Y', accountId: 'Y', rating: 1100 }, z: { name: 'Zed Z', accountId: null },
  },
};
const s2: SessionInput = {
  ...s1, sessionId: 's2', name: 'Session 91', date: '2026-10-09T18:00:00Z', me: 'm2', myRating: 1030, myStart: 1010,
  games: [g(1, ['m2', 'p2'], ['x2', 'q'], 21, 19)],
  people: { m2: { name: 'Me Myself', accountId: 'ME' }, p2: { name: 'Pat Partner', accountId: 'P' },
    x2: { name: 'xavi   x', accountId: null }, q: { name: 'Quinn Q', accountId: null } },
};

test('history: my games only, substitute games left out, newest session first', () => {
  const h = buildHistory([s1, s2]);
  assert.deepEqual(h.sessions.map((s) => s.name), ['Session 91', 'Session 90']);
  assert.equal(h.sessions[1].games.length, 4, 'round 4 was not mine; round 6 a substitute played');
  assert.deepEqual(h.totals, { sessions: 2, games: 5, won: 3, lost: 1, drawn: 1 });
  const r2 = h.sessions[1].games[1];
  assert.equal(r2.partner, 'Pat Partner'); assert.equal(r2.my, 21); assert.equal(r2.result, 'W');
});

test('history: the same person is recognised across sessions (account, else name)', () => {
  const h = buildHistory([s1, s2]);
  const xavi = h.headToHead.find((t) => t.key === 'name:xavi x')!;
  assert.equal(xavi.games, 3, 'Xavi twice in session 90, once as "xavi   x" in 91');
  assert.equal(h.partners.find((t) => t.key === 'acct:P')!.games, 3);
});

test('history: best partners need 2+ games; ratings only when shared', () => {
  const h = buildHistory([s1, s2]);
  assert.deepEqual(h.partners.map((p) => p.name), ['Pat Partner']);
  assert.equal(h.headToHead.find((t) => t.key === 'acct:Y')!.rating, 1100, 'Yas opted in (and so did I)');
  assert.equal(h.headToHead.find((t) => t.key === 'name:zed z')!.rating, undefined);
});

test('publicName: first name and last initial', () => {
  assert.equal(publicName('saranya sundar'), 'saranya S.');
  assert.equal(publicName('Thenu'), 'Thenu');
});

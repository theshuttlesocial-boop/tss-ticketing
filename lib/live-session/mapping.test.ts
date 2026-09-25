import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, nextRound, recordScore, DEFAULT_CONFIG, Level } from './engine';
import {
  rowsToSession, playerToRow, roundToGameRows, roundToRoundRow,
  LiveSessionRow, LivePlayerRow, LiveGameRow, LiveRoundRow,
} from './mapping';

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function roster(n: number) {
  const levels: Level[] = ['beginner', 'standard', 'intermediate', 'strong'];
  return Array.from({ length: n }, (_, i) => ({
    id: uuid(i + 1), name: `P${i + 1}`, level: levels[i % 3],
  }));
}

/** Persist a Session to row form, exactly as the server functions do. */
function toRows(s: ReturnType<typeof createSession>, sessionId = uuid(999)) {
  const session: LiveSessionRow = {
    id: sessionId, name: 'Test', config: s.config, seed: s.seed, status: 'live',
  };
  const players: LivePlayerRow[] = Object.values(s.players).map((p) => playerToRow(p, sessionId));
  const games: LiveGameRow[] = [];
  const rounds: LiveRoundRow[] = [];
  for (const r of s.rounds) {
    rounds.push(roundToRoundRow(r, sessionId));
    for (const g of roundToGameRows(r, sessionId)) {
      const scored = s.results.find((x) => x.round === g.round && x.court === g.court);
      games.push(scored ? { ...g, score_a: scored.scoreA, score_b: scored.scoreB } : g);
    }
  }
  return { session, players, games, rounds };
}

test('round-trip: a fresh session survives rows -> Session unchanged', () => {
  const s = createSession(roster(20), DEFAULT_CONFIG, 42);
  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);

  assert.deepEqual(back.players, s.players);
  assert.deepEqual(back.rounds, s.rounds);
  assert.deepEqual(back.results, s.results);
  assert.equal(back.seed, s.seed);
  assert.deepEqual(back.config, s.config);
});

test('round-trip: generated round preserves assignments and sit-outs', () => {
  let s = createSession(roster(20), DEFAULT_CONFIG, 7);
  s = nextRound(s);
  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);

  assert.equal(back.rounds.length, 1);
  assert.deepEqual(back.rounds[0], s.rounds[0]);
  // 20 players, 4 courts of 4 = 16 playing, 4 sitting
  assert.equal(back.rounds[0].matches.length, 4);
  assert.equal(back.rounds[0].sitOuts.length, 4);
  // Unscored assignments must NOT appear as results.
  assert.equal(back.results.length, 0);
});

test('round-trip: sit_outs and sat_last_round survive (a recompute preserves them)', () => {
  let s = createSession(roster(20), DEFAULT_CONFIG, 7);
  s = nextRound(s);
  const sat = Object.values(s.players).filter((p) => p.satLastRound);
  assert.equal(sat.length, 4);

  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);

  for (const p of Object.values(s.players)) {
    assert.equal(back.players[p.id].sitOuts, p.sitOuts, `sitOuts for ${p.name}`);
    assert.equal(back.players[p.id].satLastRound, p.satLastRound, `satLastRound for ${p.name}`);
  }
});

test('round-trip: scored games reload as results and ratings recompute identically', () => {
  let s = createSession(roster(20), DEFAULT_CONFIG, 3);
  s = nextRound(s);
  for (const m of s.rounds[0].matches) s = recordScore(s, 1, m.court, 21, 15);

  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);

  assert.equal(back.results.length, 4);
  assert.deepEqual(back.results, s.results);
  // Ratings moved off their starting values, and reloaded identically.
  for (const p of Object.values(s.players)) {
    assert.equal(back.players[p.id].rating, p.rating, `rating for ${p.name}`);
    assert.deepEqual(back.players[p.id].history, p.history, `history for ${p.name}`);
    assert.equal(back.players[p.id].games, p.games, `games for ${p.name}`);
  }
  assert.ok(Object.values(s.players).some((p) => p.history.length > 0), 'some game was rated');
});

test('round-trip: multi-round session with a partially scored latest round', () => {
  let s = createSession(roster(24), DEFAULT_CONFIG, 11);
  s = nextRound(s);
  for (const m of s.rounds[0].matches) s = recordScore(s, 1, m.court, 21, 18);
  s = nextRound(s);
  // Only two of the four courts reported in round 2.
  s = recordScore(s, 2, s.rounds[1].matches[0].court, 21, 12);
  s = recordScore(s, 2, s.rounds[1].matches[1].court, 19, 21);

  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);

  assert.equal(back.rounds.length, 2);
  assert.equal(back.results.length, 6);           // 4 + 2
  assert.equal(back.rounds[1].matches.length, 4); // all 4 still assigned
  assert.deepEqual(back.rounds, s.rounds);
  assert.deepEqual(back.results, s.results);
  assert.deepEqual(back.players, s.players);
});

test('rowsToSession: a corrected score replaces rather than appends', () => {
  let s = createSession(roster(20), DEFAULT_CONFIG, 5);
  s = nextRound(s);
  const court = s.rounds[0].matches[0].court;
  s = recordScore(s, 1, court, 21, 10);
  const afterFirst = s.results.length;
  s = recordScore(s, 1, court, 15, 21);   // correction

  assert.equal(s.results.length, afterFirst, 'no duplicate result row');
  const { session, players, games, rounds } = toRows(s);
  const back = rowsToSession(session, players, games, rounds);
  const g = back.results.find((r) => r.round === 1 && r.court === court);
  assert.equal(g.scoreA, 15);
  assert.equal(g.scoreB, 21);
});

test('rowsToSession: a round with no games still appears (sit-outs only)', () => {
  const session: LiveSessionRow = {
    id: uuid(999), name: 'T', config: DEFAULT_CONFIG, seed: 1, status: 'live',
  };
  const back = rowsToSession(session, [], [], [
    { session_id: uuid(999), round: 1, sit_outs: [uuid(1), uuid(2)] },
  ]);
  assert.equal(back.rounds.length, 1);
  assert.deepEqual(back.rounds[0].sitOuts, [uuid(1), uuid(2)]);
  assert.equal(back.rounds[0].matches.length, 0);
});

test('rowsToSession: rows arriving out of order are normalised', () => {
  let s = createSession(roster(20), DEFAULT_CONFIG, 9);
  s = nextRound(s);
  s = nextRound(s);
  const { session, players, games, rounds } = toRows(s);

  const shuffled = [...games].reverse();
  const back = rowsToSession(session, players, shuffled, [...rounds].reverse());

  assert.deepEqual(back.rounds.map((r) => r.index), [1, 2]);
  assert.deepEqual(back.rounds, s.rounds);
});

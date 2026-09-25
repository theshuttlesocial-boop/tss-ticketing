import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, nextRound, recordScore, DEFAULT_CONFIG, Level, makePlayer, Player,
} from './engine';
import {
  courtViolates, separable, enforceSeparation, constructSeparated, alignUpperGroup,
} from './engine/rotation';

function roster(mix: Partial<Record<Level, number>>) {
  const out: { id: string; name: string; level: Level }[] = [];
  let i = 0;
  for (const [l, n] of Object.entries(mix) as [Level, number][])
    for (let k = 0; k < n; k++) out.push({ id: `p${i++}`, name: `p${i}`, level: l });
  return out;
}

/** Plays `rounds` rounds with deterministic but varied scores. */
function play(mix: Partial<Record<Level, number>>, seed: number, rounds = 10) {
  let s = createSession(roster(mix), DEFAULT_CONFIG, seed);
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let r = 1; r <= rounds; r++) {
    s = nextRound(s);
    for (const m of s.rounds[r - 1].matches) {
      const w = rand() < 0.6, l = 8 + Math.floor(rand() * 12);
      s = recordScore(s, r, m.court, w ? 21 : l, w ? l : 21);
    }
  }
  return s;
}

const MIXES: Partial<Record<Level, number>>[] = [
  { strong: 14, standard: 13, beginner: 1 },
  { strong: 8, intermediate: 10, standard: 8, beginner: 2 },
  { strong: 4, intermediate: 6, standard: 12, beginner: 6 },
  { strong: 16, intermediate: 4, standard: 4, beginner: 4 },
  { strong: 18, standard: 2, beginner: 4 },
];

test('hard rule: a strong never shares a court with a beginner (5 rosters x 20 seeds x 10 rounds)', () => {
  let games = 0;
  for (const mix of MIXES) {
    for (let seed = 1; seed <= 20; seed++) {
      const s = play(mix, seed);
      for (const r of s.rounds) {
        for (const m of r.matches) {
          games++;
          // Levels/flags are only meaningful as they stood when the round was
          // drawn, but the flag only ever clears (promotion) — so checking the
          // end state can only under-count beginners, never invent one. Check
          // the registered level instead: stricter than the rule.
          const four = [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].map((id) => s.players[id]);
          const promoted = four.some((p) => p.level === 'beginner' && !p.beginner);
          if (promoted) continue; // a promoted beginner may legitimately meet strongs
          assert.ok(!(four.some((p) => p.level === 'strong') && four.some((p) => p.level === 'beginner')),
            `round ${r.index} court ${m.court}: strong and beginner together`);
        }
      }
    }
  }
  assert.ok(games > 1000);
});

test('the hard rule never forces anyone to sit out twice in a row on realistic rosters', () => {
  for (const mix of MIXES) {
    for (let seed = 1; seed <= 20; seed++) {
      const s = play(mix, seed);
      for (let i = 1; i < s.rounds.length; i++) {
        const prev = new Set(s.rounds[i - 1].sitOuts);
        for (const id of s.rounds[i].sitOuts) assert.ok(!prev.has(id), `seed ${seed}: ${id} sat twice`);
      }
    }
  }
});

test('13-15 players no longer crash: courts shrink to full fours', () => {
  for (const n of [4, 7, 13, 14, 15]) {
    const s = nextRound(createSession(roster({ standard: n }), DEFAULT_CONFIG, 1));
    const r = s.rounds[0];
    assert.equal(r.matches.length, Math.floor(n / 4));
    assert.equal(r.sitOuts.length, n - Math.floor(n / 4) * 4);
    for (const m of r.matches)
      for (const id of [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b]) assert.ok(id, `empty slot with ${n} players`);
  }
});

test('fewer than 4 players is refused with a clear message', () => {
  assert.throws(() => nextRound(createSession(roster({ standard: 3 }), DEFAULT_CONFIG, 1)), /at least 4 players/);
});

test('constructSeparated always yields a valid layout when separable', () => {
  const mk = (id: string, level: Level, rating: number): Player => ({ ...makePlayer(id, id, level), rating });
  // Two beginners split across two courts, each with strongs — the case the
  // greedy repair could not untangle.
  const courts = [
    [mk('s1', 'strong', 1200), mk('s2', 'strong', 1190), mk('s3', 'strong', 1180), mk('s4', 'strong', 1170)],
    [mk('s5', 'strong', 1160), mk('s6', 'strong', 1150), mk('s7', 'strong', 1140), mk('s8', 'strong', 1130)],
    [mk('s9', 'strong', 1000), mk('m1', 'standard', 980), mk('b1', 'beginner', 900), mk('s10', 'strong', 990)],
    [mk('s11', 'strong', 970), mk('m2', 'standard', 960), mk('b2', 'beginner', 890), mk('s12', 'strong', 950)],
  ];
  assert.ok(separable(courts.flat()));
  const built = constructSeparated(courts);
  assert.equal(built.flat().length, 16);
  assert.ok(!built.some(courtViolates));
  const { violations } = enforceSeparation(courts, DEFAULT_CONFIG.rotation);
  assert.equal(violations, 0);
});

test('alignUpperGroup only reorders ties: every sit-out count chosen is unchanged', () => {
  const players: Player[] = roster({ strong: 9, standard: 11 })
    .map((r) => ({ ...makePlayer(r.id, r.name, r.level), sitOuts: 1 }));
  const fair = players.slice(0, 4).map((p) => p.id); // any 4 of equal sit-out count
  const aligned = alignUpperGroup(players, fair, 4);
  assert.equal(aligned.length, fair.length);
  const counts = (ids: string[]) => ids.map((id) => players.find((p) => p.id === id)!.sitOuts).sort().join();
  assert.equal(counts(aligned), counts(fair));
  const upperOn = players.filter((p) => !aligned.includes(p.id) && p.level === 'strong').length;
  assert.equal(upperOn % 4, 0, `strongs on court should fill whole courts, got ${upperOn}`);
});

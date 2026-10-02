import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, makePlayer, solveRound, chooseSplit, History, tier, Level, Player } from './engine';

// v3 matching rules (October 2026), from the owner's review of Session 90:
//  - strongs play strongs, or the best intermediates when there aren't enough;
//  - no court of three strongs and one intermediate (St+I v St+I instead);
//  - the repeat-avoiding swap never pulls a lower level onto a higher court;
//  - beginners play beginners and standards, partnered by a standard.

const cfg = DEFAULT_CONFIG.rotation;
function roster(spec: [Level, number][]): Record<string, Player> {
  const m: Record<string, Player> = {};
  spec.forEach(([lvl, rating], i) => { const p = makePlayer(`p${String(i).padStart(2, '0')}`, `P${i}`, lvl); m[p.id] = { ...p, rating }; });
  return m;
}
const courtsOf = (r: ReturnType<typeof solveRound>, P: Record<string, Player>) =>
  r.round.matches.map((m) => [m.teamA.a, m.teamA.b, m.teamB.a, m.teamB.b].map((id) => P[id]));

test('v3 is on for new sessions', () => {
  assert.equal(cfg.levelFirst, true);
  assert.equal(cfg.evenBoundary, true);
  assert.equal(cfg.sameLevelSwaps, true);
  assert.ok((cfg.cost.levelGap ?? 0) > 0 && (cfg.cost.widePair ?? 0) > 0);
});

test('an intermediate rated above some strongs still plays below them (level first)', () => {
  // Session 90, round 7: an intermediate on 1088 sat above a strong on 1086 by rating.
  const P = roster([['strong', 1207], ['strong', 1195], ['strong', 1178], ['strong', 1173], ['strong', 1142], ['strong', 1129],
    ['strong', 1117], ['strong', 1086], ['intermediate', 1088], ['intermediate', 1060], ['intermediate', 1048], ['standard', 1033],
    ['intermediate', 1020], ['standard', 980], ['standard', 964], ['standard', 951]]);
  const courts = courtsOf(solveRound(P, [], cfg, 1), P);
  assert.ok(courts[0].every((p) => p.level === 'strong') && courts[1].every((p) => p.level === 'strong'),
    'eight strongs fill courts 1 and 2');
});

test('no court of three strongs and one intermediate', () => {
  // Seven strongs: rating order gives court 2 three strongs + one intermediate.
  const P = roster([['strong', 1200], ['strong', 1190], ['strong', 1180], ['strong', 1170], ['strong', 1160], ['strong', 1150],
    ['strong', 1140], ['intermediate', 1110], ['intermediate', 1080], ['intermediate', 1070], ['intermediate', 1060],
    ['intermediate', 1050], ['standard', 1000], ['standard', 990], ['standard', 980], ['standard', 970]]);
  for (const c of courtsOf(solveRound(P, [], cfg, 1), P)) {
    const top = Math.max(...c.map(tier));
    assert.ok(!(c.filter((p) => tier(p) === top).length === 3 && c.some((p) => tier(p) < top)), 'a court is 3 + 1');
  }
});

test('two strongs and two intermediates play St+I v St+I, never St+St v I+I', () => {
  const P = roster([['strong', 1150], ['strong', 1140], ['intermediate', 1130], ['intermediate', 1020]]);
  const court = Object.values(P);
  const s = chooseSplit(court, new History([]), cfg);
  for (const t of [s.teamA, s.teamB]) assert.deepEqual([P[t.a].level, P[t.b].level].sort(), ['intermediate', 'strong']);
});

test('the repeat-avoiding swap never moves an intermediate onto the strongs court', () => {
  // Session 90, round 8: four strongs who'd all just played together, five strongs
  // in all. v2 swapped an intermediate up to break the repeats.
  const P = roster([['strong', 1209], ['strong', 1194], ['strong', 1182], ['strong', 1177], ['strong', 1172],
    ['intermediate', 1113], ['intermediate', 1073], ['intermediate', 1061], ['intermediate', 1061], ['intermediate', 1060],
    ['intermediate', 1037], ['standard', 1049], ['intermediate', 1011], ['standard', 958], ['standard', 950], ['beginner', 900]]);
  const ids = Object.keys(P);
  const prev = [{ index: 1, sitOuts: [], matches: [
    { court: 1, teamA: { a: ids[0], b: ids[3] }, teamB: { a: ids[1], b: ids[2] } },
    { court: 2, teamA: { a: ids[4], b: ids[8] }, teamB: { a: ids[5], b: ids[7] } },
    { court: 3, teamA: { a: ids[6], b: ids[10] }, teamB: { a: ids[9], b: ids[11] } },
    { court: 4, teamA: { a: ids[12], b: ids[15] }, teamB: { a: ids[13], b: ids[14] } },
  ] }];
  const courts = courtsOf(solveRound(P, prev, cfg, 1), P);
  assert.ok(courts[0].every((p) => p.level === 'strong'), 'court 1 is four strongs');
});

test('a beginner partners a standard, not an intermediate', () => {
  const P = roster([['intermediate', 1040], ['standard', 990], ['standard', 960], ['beginner', 900]]);
  const s = chooseSplit(Object.values(P), new History([]), cfg, true);
  const beg = Object.values(P).find((p) => p.level === 'beginner')!.id;
  const team = [s.teamA, s.teamB].find((t) => t.a === beg || t.b === beg)!;
  const partner = P[team.a === beg ? team.b : team.a];
  assert.equal(partner.level, 'standard');
});

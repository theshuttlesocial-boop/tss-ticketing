/**
 * Replays Session 89 with automatic level review on and reports what it would
 * have done. Run: npx tsx scripts/session89-review.ts
 *
 * The draws and scores are the real ones (a changed level would have changed
 * later draws, which can't be replayed honestly). Before each round, the
 * review runs on the results so far; its moves are applied with the rating
 * adjustment, exactly as the server would. Real admin edits (Nikesh, Joe) are
 * applied at the round they happened.
 */
import { changeLevel, flagGames, makePlayer, recomputeRatings, reviewLevels, replay, Player, Session } from '../lib/live-session/engine';
import { loadFixture, fixtureConfig, fixtureResults, fixtureRounds, levelAt, pid } from '../lib/live-session/fixtures';

const f = loadFixture('session-89.json');
// Auto-apply on, to show every move the review would make (the default is suggest-only).
const base = fixtureConfig(f);
const cfg = { ...base, levels: { ...base.levels, autoApply: true } };
const name = (id: string) => f.players[Number(id.slice(1))].name;
const players: Record<string, Player> = {};
f.players.forEach((p, i) => { players[pid(i)] = makePlayer(pid(i), p.name, levelAt(f, i, 1), cfg.rating); });
const all = fixtureResults(f);
let s: Session = { config: cfg, players, rounds: fixtureRounds(f), results: [], seed: 1 };

console.log('Session 89 with automatic level review (thresholds: ' + JSON.stringify(cfg.levels) + ')\n');
for (let r = 1; r <= 9; r++) {
  for (const h of (f.levelHistory ?? []).filter((x) => x.changedBeforeRound === r)) {
    s = changeLevel(s, pid(h.player), h.to, r, 'admin', 'real admin edit');
    console.log(`Before R${r} · Admin · ${name(pid(h.player))} ${h.from} → ${h.to} (real edit)`);
  }
  for (const p of reviewLevels(s)) {
    if (p.auto) s = changeLevel(s, p.playerId, p.to, r, 'system');
    console.log(`Before R${r} · System · ${p.name} ${p.from} → ${p.to} · rating ${Math.round(p.rating)} after ${p.games} games${p.auto ? '' : ' (suggested)'}`);
  }
  s = recomputeRatings({ ...s, results: all.filter((g) => g.round <= r) });
}

console.log('\nFlagged games (margin ≥ ' + cfg.levels.mismatchMargin + ' or point share off by ≥ ' + cfg.levels.mismatchShare + '):');
const rp = replay(s);
for (const g of flagGames(s, rp)) {
  const res = all.find((x) => x.round === g.round && x.court === g.court)!;
  const t = (a: string, b: string) => `${name(a)} & ${name(b)}`;
  console.log(`R${g.round} C${g.court} · ${t(res.teamA.a, res.teamA.b)} ${res.scoreA}–${res.scoreB} ${t(res.teamB.a, res.teamB.b)}` +
    ` · expected share ${g.expectedA.toFixed(2)}, got ${g.actualA.toFixed(2)}` +
    (g.cause ? ` · likely cause: ${g.cause.name} (${g.cause.level}, rating ${Math.round(g.cause.rating)})${g.cause.suggest ? ` → offer ${g.cause.suggest}` : ''}` : ''));
}

console.log('\nEnd of night, review on vs the real night:');
const real = recomputeRatings({ ...s, players: Object.fromEntries(Object.values(players).map((p) => [p.id, { ...p, level: f.players[Number(p.id.slice(1))].level, startLevel: f.players[Number(p.id.slice(1))].level }])), results: all });
for (const p of Object.values(s.players).filter((x) => (x.levelChanges ?? []).length)) {
  console.log(`  ${p.name.padEnd(28)} ${p.startLevel} → ${p.level}   rating ${Math.round(p.rating)} (real night ${Math.round(real.players[p.id].rating)})`);
}

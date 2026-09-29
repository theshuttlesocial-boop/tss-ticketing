/**
 * Before/after: the current per-session rating (v1) vs the TSS Rating (v2),
 * in both outcome modes. Run: npx tsx scripts/rating-v2-compare.ts
 *
 * Measure: how often the favourite won ("winner prediction"), from round 3 on,
 * skipping even games and draws — the measure quoted for Session 88 (81%).
 * The simulation also checks how well each rating ranks players against
 * their hidden true skill, over four weekly sessions with the same regulars.
 */
import { createSession, nextRound, recordScore, replay, DEFAULT_CONFIG, Level, expectedShare } from '../lib/live-session/engine'
import { loadFixture, fixtureResults, fixtureConfig, pid } from '../lib/live-session/fixtures'
import { RATING_V2, RatingV2Config } from '../lib/rating-v2/config'
import { predictionAccuracy, replayV2, RatedGame } from '../lib/rating-v2/engine'

const pct = (x: number | null) => (x == null ? '  –  ' : `${(x * 100).toFixed(0).padStart(3)}%`)
const modes: [string, RatingV2Config][] = [['v2 win/loss', RATING_V2], ['v2 point-share', { ...RATING_V2, outcome: 'point_share' }]]

function v1Accuracy(games: { round: number; expectedA: number; actualA: number }[], from = 3) {
  const called = games.filter((g) => g.round >= from && g.actualA !== 0.5 && Math.abs(g.expectedA - 0.5) > 1e-9)
  const right = called.filter((g) => (g.expectedA > 0.5) === (g.actualA > 0.5)).length
  return { games: called.length, accuracy: called.length ? right / called.length : null }
}

// ── The two real sessions ────────────────────────────────────────────────
console.log('Winner prediction from round 3 (real sessions)\n')
console.log('                     v1 (now)   v2 win/loss   v2 point-share   games')
for (const [file, date] of [['session-88.json', '2026-09-24'], ['session-89.json', '2026-09-25']] as const) {
  const f = loadFixture(file)
  const cfg = fixtureConfig(f)
  const players = Object.fromEntries(f.players.map((p, i) => [pid(i), { id: pid(i), name: p.name, level: p.level, rating: cfg.rating.start[p.level],
    games: 0, sitOuts: 0, satLastRound: false, beginner: p.level === 'beginner', aboveMedianStreak: 0, history: [] }]))
  const results = fixtureResults(f)
  const v1 = replay({ config: cfg, players: players as any, rounds: [], results, seed: 1 }).games
    .map((g) => ({ round: g.round, expectedA: g.expectedA, actualA: g.actualA > 0.5 ? 1 : g.actualA < 0.5 ? 0 : 0.5 }))
  const roster = f.players.map((p, i) => ({ key: pid(i), level: p.level }))
  const games: RatedGame[] = results.map((g) => ({ at: `${date}T18:${String(g.round * 5 + g.court).padStart(2, '0')}:00Z`,
    teamA: [g.teamA.a, g.teamA.b], teamB: [g.teamB.a, g.teamB.b], scoreA: g.scoreA, scoreB: g.scoreB }))
  const row = [pct(v1Accuracy(v1).accuracy)]
  let n = 0
  for (const [, c] of modes) {
    const r = replayV2(roster, games, c)
    const acc = predictionAccuracy(r.games, (g) => Number(g.at.slice(14, 16)) >= 15)
    row.push(pct(acc.accuracy)); n = acc.games
  }
  console.log(`  ${f.session.padEnd(18)} ${row[0]}        ${row[1]}           ${row[2]}          ${n}`)
}

// ── Simulation: 28 regulars, four weekly sessions ────────────────────────
function prng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
const spearman = (xs: number[], ys: number[]) => {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r }
  const rx = rank(xs), ry = rank(ys), n = xs.length
  return 1 - (6 * rx.reduce((s, x, i) => s + (x - ry[i]) ** 2, 0)) / (n * (n * n - 1))
}
const LV: Level[] = ['beginner', 'standard', 'intermediate', 'strong']
const MIX: Record<Level, number> = { strong: 5, intermediate: 9, standard: 10, beginner: 4 }

const tot = { v1: [0, 0], v2: [0, 0], v2p: [0, 0], rho1: 0, rho2: 0, rho2p: 0, runs: 0 }
for (let seed = 1; seed <= 100; seed++) {
  const r = prng(seed * 7919)
  const roster: { id: string; name: string; level: Level }[] = [], truth: Record<string, number> = {}
  let i = 0
  for (const l of LV) for (let k = 0; k < MIX[l]; k++) { const id = `p${i++}`; truth[id] = DEFAULT_CONFIG.rating.start[l] + gauss(r) * 45; roster.push({ id, name: id, level: l }) }
  const all: RatedGame[] = []; const v1Games: { round: number; expectedA: number; actualA: number }[] = []
  let lastV1: Record<string, number> = {}
  for (let week = 0; week < 4; week++) {
    let s = createSession(roster, DEFAULT_CONFIG, seed * 100 + week)
    for (let rd = 1; rd <= 8; rd++) {
      s = nextRound(s)
      for (const m of s.rounds[rd - 1].matches) {
        const tA = (truth[m.teamA.a] + truth[m.teamA.b]) / 2, tB = (truth[m.teamB.a] + truth[m.teamB.b]) / 2
        const share = Math.min(0.95, Math.max(0.05, expectedShare(tA, tB, { ...DEFAULT_CONFIG.rating, clip: [0.05, 0.95] }) + gauss(r) * 0.07))
        const [a, b] = share >= 0.5 ? [21, Math.round(21 * (1 - share) / share)] : [Math.round(21 * share / (1 - share)), 21]
        const pre = replay(s).players
        const eA = expectedShare((pre[m.teamA.a].rating + pre[m.teamA.b].rating) / 2, (pre[m.teamB.a].rating + pre[m.teamB.b].rating) / 2, DEFAULT_CONFIG.rating)
        v1Games.push({ round: rd, expectedA: eA, actualA: a > b ? 1 : a < b ? 0 : 0.5 })
        s = recordScore(s, rd, m.court, a, b)
        all.push({ at: `2026-10-${String(1 + week * 7).padStart(2, '0')}T18:${String(rd * 6 + m.court).padStart(2, '0')}:00Z`,
          teamA: [m.teamA.a, m.teamA.b], teamB: [m.teamB.a, m.teamB.b], scoreA: a, scoreB: b })
      }
    }
    lastV1 = Object.fromEntries(Object.values(s.players).map((p) => [p.id, p.rating]))
  }
  const a1 = v1Accuracy(v1Games); tot.v1[0] += a1.games; tot.v1[1] += (a1.accuracy ?? 0) * a1.games
  const ids = roster.map((p) => p.id), tr = ids.map((k) => truth[k])
  tot.rho1 += spearman(ids.map((k) => lastV1[k]), tr)
  for (const [key, c] of [['v2', RATING_V2], ['v2p', { ...RATING_V2, outcome: 'point_share' as const }]] as const) {
    const rv = replayV2(roster.map((p) => ({ key: p.id, level: p.level })), all, c)
    const acc = predictionAccuracy(rv.games, (g) => Number(g.at.slice(14, 16)) >= 18)
    ;(tot as any)[key][0] += acc.games; (tot as any)[key][1] += acc.right
    ;(tot as any)[key === 'v2' ? 'rho2' : 'rho2p'] += spearman(ids.map((k) => rv.players[k].rating), tr)
  }
  tot.runs++
}
console.log('\nSimulation: 28 regulars, 4 weekly sessions of 8 rounds, 100 runs\n')
console.log(`  Winner prediction (from round 3)   v1 ${pct(tot.v1[1] / tot.v1[0])}   v2 win/loss ${pct(tot.v2[1] / tot.v2[0])}   v2 point-share ${pct(tot.v2p[1] / tot.v2p[0])}`)
console.log(`  Ranking vs true skill (Spearman)   v1 ${(tot.rho1 / tot.runs).toFixed(2)}    v2 win/loss ${(tot.rho2 / tot.runs).toFixed(2)}    v2 point-share ${(tot.rho2p / tot.runs).toFixed(2)}`)
console.log('  (v1 starts again every week from each level; v2 carries over. Ranking uses the end of week 4.)')

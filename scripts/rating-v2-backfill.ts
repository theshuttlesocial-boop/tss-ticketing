/**
 * Read-only backfill of the TSS Rating (v2): replays every past live session
 * in date order and prints what the ratings would be, plus each session's
 * winner-prediction accuracy in both modes. Writes nothing.
 * Run from the repo root (needs .env.local): npx tsx scripts/rating-v2-backfill.ts
 */
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('='); if (i < 1 || line.trim().startsWith('#')) continue
  process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^"|"$/g, '')
}

async function main() {
  const { loadV2History } = await import('../lib/rating-v2/fromDb')
  const { replayV2, predictionAccuracy, isNew } = await import('../lib/rating-v2/engine')
  const { RATING_V2 } = await import('../lib/rating-v2/config')
  const h = await loadV2History()
  console.log(`${h.sessions.length} sessions, ${h.games.length} scored games, ${h.roster.length} people\n`)
  const modes = [['win/loss', RATING_V2], ['point-share', { ...RATING_V2, outcome: 'point_share' as const }]] as const
  const runs = modes.map(([, c]) => replayV2(h.roster, h.games, c))
  console.log('Winner prediction from round 3, by session:')
  for (const s of h.sessions) {
    const inS = new Set(h.games.filter((g) => g.sessionId === s.id && g.round >= 3).map((g) => g.at))
    const cells = runs.map((r) => predictionAccuracy(r.games, (g) => inS.has(g.at)))
    if (!cells[0].games) continue
    console.log(`  ${s.name.padEnd(24)} ${s.at.slice(0, 10)}   win/loss ${((cells[0].accuracy ?? 0) * 100).toFixed(0)}%   point-share ${((cells[1].accuracy ?? 0) * 100).toFixed(0)}%   (${cells[0].games} games)`)
  }
  const now = new Date().toISOString()
  console.log('\nRatings now (win/loss mode; point-share in brackets):')
  const rows = Object.values(runs[0].players).filter((p) => h.names[p.key])
    .sort((a, b) => b.rating - a.rating)
  for (const p of rows) {
    const ps = runs[1].players[p.key]?.rating
    console.log(`  ${h.names[p.key].padEnd(28)} ${Math.round(p.rating)}  (${Math.round(ps ?? 0)})  ${isNew(p, now) ? 'New' : ''}`)
  }
}
main()

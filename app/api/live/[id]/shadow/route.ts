import { NextResponse } from 'next/server'
import { allowed, checkLive } from '@/lib/live-session/auth'
import { loadSession } from '@/lib/live-session/actions'
import { replay } from '@/lib/live-session/engine'
import { loadV2History, shadowFor } from '@/lib/rating-v2/fromDb'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Staff only. Shadow comparison for this session (Roadmap Phase 6): how often
 * each rating predicted the winner from round 3 — the rating in use now (v1),
 * and the TSS Rating (v2) in both outcome modes, carried over from every
 * earlier session — plus each player's v2 rating. Nothing here changes the draw.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!allowed(await checkLive(req, id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const [session, h] = await Promise.all([loadSession(id), loadV2History(id)])
  const v1 = replay(session).games.filter((g) => g.round >= 3 && g.actualA !== 0.5 && Math.abs(g.expectedA - 0.5) > 1e-9)
  const v1Right = v1.filter((g) => (g.expectedA > 0.5) === (g.actualA > 0.5)).length
  const v2 = shadowFor(h, id)
  return NextResponse.json({
    v1: { accuracy: v1.length ? v1Right / v1.length : null, games: v1.length },
    winLoss: v2.win_loss, pointShare: v2.point_share,
    sessionsCounted: h.sessions.length,
  })
}

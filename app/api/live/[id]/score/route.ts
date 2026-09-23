import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { recordScore, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { round, court, score_a, score_b } = await req.json()

  if ([round, court, score_a, score_b].some((v) => typeof v !== 'number'))
    return NextResponse.json({ error: 'round, court, score_a, score_b must be numbers' }, { status: 400 })

  try {
    const session = await recordScore(id, round, court, score_a, score_b)
    return NextResponse.json({ players: session.players })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}

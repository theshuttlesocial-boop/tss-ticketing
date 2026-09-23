import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { overrideSlot, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }
const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const

export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { round, court, slot, player_id } = await req.json()

  if (typeof round !== 'number' || typeof court !== 'number')
    return NextResponse.json({ error: 'round and court must be numbers' }, { status: 400 })
  if (!SLOTS.includes(slot))
    return NextResponse.json({ error: `slot must be one of ${SLOTS.join(', ')}` }, { status: 400 })
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })

  try {
    const session = await overrideSlot(id, round, court, slot, player_id)
    return NextResponse.json({ players: session.players })
  } catch (e) {
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}

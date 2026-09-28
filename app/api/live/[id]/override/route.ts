import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/live-session/auth'
import { overrideSlot, markUnknownSubstitute, LiveSessionError, NeedsConfirmError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }
const SLOTS = ['A.a', 'A.b', 'B.a', 'B.b'] as const

/**
 * Swap players / "Played by someone else" — any round, not only the current
 * one: { round, court, slot, player_id, force? }.
 * "Unknown substitute" — { round, court, unknown: true|false, player_id }.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const { round, court, slot, player_id, force, unknown } = await req.json()

  if (typeof round !== 'number' || typeof court !== 'number')
    return NextResponse.json({ error: 'round and court must be numbers' }, { status: 400 })
  if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 })

  try {
    if (typeof unknown === 'boolean') {
      const s = await markUnknownSubstitute(id, round, court, player_id, unknown)
      return NextResponse.json({ players: s.players })
    }
    if (!SLOTS.includes(slot))
      return NextResponse.json({ error: `slot must be one of ${SLOTS.join(', ')}` }, { status: 400 })
    const session = await overrideSlot(id, round, court, slot, player_id, { force: force === true })
    return NextResponse.json({ players: session.players })
  } catch (e) {
    if (e instanceof NeedsConfirmError) return NextResponse.json({ error: e.message, needsConfirm: true }, { status: 409 })
    const status = e instanceof LiveSessionError ? 400 : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}

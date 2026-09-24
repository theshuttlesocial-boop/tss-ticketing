import { NextResponse } from 'next/server'
import { loadSession } from '@/lib/live-session/actions'
import { playerView } from '@/lib/live-session/redact'

type Ctx = { params: Promise<{ id: string; playerId: string }> }

/**
 * One player's own view. Public, because the player has no login — knowing the
 * id is the credential. It returns that player's own rating and form plus the
 * redacted session; no other player's numbers are included.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id, playerId } = await params
  try {
    const session = await loadSession(id)
    const view = playerView(session, playerId)
    if (!view) return NextResponse.json({ error: 'Player not in this session' }, { status: 404 })
    return NextResponse.json({ player: view })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}

import { NextResponse } from 'next/server'
import { playerCookie } from '@/lib/live-session/pin'
import { signInWithPin } from '@/lib/live-session/pinServer'

type Ctx = { params: Promise<{ id: string }> }

/**
 * "Already registered?" — public. Name + 4-digit PIN → your page, and this
 * phone remembers you. At most 5 wrong tries per name per 10 minutes.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const { name, pin } = await req.json().catch(() => ({}))
  const r = await signInWithPin(id, name, pin)
  if (r.ok === false) return NextResponse.json({ error: r.error }, { status: r.status })
  const res = NextResponse.json({ player_id: r.playerId })
  res.cookies.set(playerCookie(id, r.playerId, new URL(req.url).protocol === 'https:'))
  return res
}

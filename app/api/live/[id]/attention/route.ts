import { NextResponse } from 'next/server'
import { allowed, checkLive } from '@/lib/live-session/auth'
import { attention, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

/** Needs-attention panel: { action: 'dismiss' | 'undo' | 'apply', key?, text?, player_id?, to? } */
export async function POST(req: Request, { params }: Ctx) {
  if (!allowed(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!['dismiss', 'undo', 'apply'].includes(body.action))
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  try { await attention(id, body); return NextResponse.json({ ok: true }) }
  catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof LiveSessionError ? 400 : 500 })
  }
}

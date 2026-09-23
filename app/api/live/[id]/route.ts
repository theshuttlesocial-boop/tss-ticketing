import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdmin } from '@/lib/live-session/auth'
import { loadSession, createLiveSession, LiveSessionError } from '@/lib/live-session/actions'

type Ctx = { params: Promise<{ id: string }> }

// Public: the board and player pages read this without a login.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const session = await loadSession(id)
    return NextResponse.json({ session })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const update: Record<string, any> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.config !== undefined) update.config = body.config
  if (body.seed !== undefined) update.seed = body.seed
  if (body.status !== undefined) {
    if (!['setup', 'live', 'finished'].includes(body.status))
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    update.status = body.status
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('live_sessions').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

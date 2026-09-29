import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkLive } from '@/lib/live-session/auth'
import { applyTimer, rowToTimer, timerToRow, TimerAction } from '@/lib/live-session/timer'

type Ctx = { params: Promise<{ id: string }> }
const ACTIONS = ['start', 'pause', 'resume', 'reset', 'add']

/**
 * Admin-only: start / pause / resume / reset / +1 min on the current round's
 * timer. Applied with the SERVER's clock, so a phone with a wrong clock can't
 * skew it. Every screen picks the change up through realtime on live_rounds.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (!ACTIONS.includes(body.action)) return NextResponse.json({ error: 'unknown timer action' }, { status: 400 })

  const { data: rows, error } = await supabaseAdmin.from('live_rounds').select('*')
    .eq('session_id', id).order('round', { ascending: false }).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'Draw a round first' }, { status: 409 })
  if (!('timer_started_at' in row))
    return NextResponse.json({ error: 'Run migration 012 in Supabase to turn on the shared timer' }, { status: 503 })

  try {
    const next = applyTimer(rowToTimer(row), body as TimerAction, Date.now())
    const { error: uErr } = await supabaseAdmin.from('live_rounds').update(timerToRow(next))
      .eq('session_id', id).eq('round', row.round)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    return NextResponse.json({ round: row.round, timer: next, serverNow: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

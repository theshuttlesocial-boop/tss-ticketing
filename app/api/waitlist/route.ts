import { requireAdmin } from '@/lib/staff'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWaitlistConfirmation, sendAdminWaitlistNotification } from '@/lib/email'

export async function POST(req: Request) {
  const body = await req.json()
  const { name, email, phone } = body

  // Accept the new multi-session shape, or fall back to a single session_id.
  const sessionIds: string[] = Array.isArray(body.session_ids) && body.session_ids.length
    ? body.session_ids
    : (body.session_id ? [body.session_id] : [])

  if (!sessionIds.length || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })

  const spacesNeeded = Math.min(4, Math.max(1, Number(body.spaces_needed) || 1))
  let minSpaces = Number(body.min_spaces_acceptable) || 1
  minSpaces = Math.min(spacesNeeded, Math.max(1, minSpaces))

  // Which of these sessions is this email already waitlisted for? Skip those.
  const { data: existing } = await supabaseAdmin
    .from('waitlist').select('session_id').eq('email', email).in('session_id', sessionIds)
  const already = new Set((existing ?? []).map(e => e.session_id))
  const toAdd = sessionIds.filter(id => !already.has(id))

  if (!toAdd.length)
    return NextResponse.json({ error: 'You are already on the waitlist for these sessions' }, { status: 409 })

  const groupId = crypto.randomUUID()
  const results: { session_id: string; position: number }[] = []

  // preference_rank follows the submitted order (index 0 = first choice).
  for (let i = 0; i < sessionIds.length; i++) {
    const sessionId = sessionIds[i]
    if (already.has(sessionId)) continue

    const { data: posData } = await supabaseAdmin
      .from('waitlist').select('position').eq('session_id', sessionId)
      .order('position', { ascending: false }).limit(1)
    const position = ((posData?.[0]?.position) ?? 0) + 1

    const { error } = await supabaseAdmin.from('waitlist').insert({
      session_id: sessionId, name, email, phone, position,
      spaces_needed: spacesNeeded, min_spaces_acceptable: minSpaces,
      waitlist_group_id: groupId, preference_rank: i + 1, status: 'waiting',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    results.push({ session_id: sessionId, position })
  }

  // Confirmation for the first-choice session only.
  const primaryId = toAdd[0]
  const primaryPos = results.find(r => r.session_id === primaryId)?.position ?? 1
  const { data: session } = await supabaseAdmin
    .from('sessions').select('title, date, time, venue').eq('id', primaryId).single()
  if (session) {
    sendWaitlistConfirmation({ to: email, name, position: primaryPos, sessionTitle: session.title, sessionDate: session.date }).catch(console.error)
    sendAdminWaitlistNotification({ name, email, phone, position: primaryPos, sessionTitle: session.title, sessionDate: session.date, sessionTime: session.time, venue: session.venue }).catch(console.error)
  }

  return NextResponse.json({ position: primaryPos, added: results })
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  let query = supabaseAdmin.from('waitlist').select('*, sessions(title,date)').order('position')
  if (session_id) query = query.eq('session_id', session_id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ waitlist: data })
}

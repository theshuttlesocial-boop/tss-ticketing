import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWaitlistConfirmation } from '@/lib/email'

export async function POST(req: Request) {
  const { session_id, name, email, phone } = await req.json()
  if (!session_id || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })

  // Check not already on waitlist
  const { data: existing } = await supabaseAdmin.from('waitlist').select('id').eq('session_id', session_id).eq('email', email).single()
  if (existing) return NextResponse.json({ error: 'You are already on the waitlist' }, { status: 409 })

  const { data: pos } = await supabaseAdmin.rpc('get_next_waitlist_position', { p_session_id: session_id })
  const position = pos ?? 1

  const { data: entry, error } = await supabaseAdmin.from('waitlist').insert({ session_id, name, email, phone, position }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: session } = await supabaseAdmin.from('sessions').select('title, date').eq('id', session_id).single()
  if (session) sendWaitlistConfirmation({ to: email, name, position, sessionTitle: session.title, sessionDate: session.date }).catch(console.error)

  return NextResponse.json({ position, entry })
}

export async function GET(req: Request) {
  const adminSecret = req.headers.get('x-admin-secret')
  if (adminSecret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  let query = supabaseAdmin.from('waitlist').select('*, sessions(title,date)').order('position')
  if (session_id) query = query.eq('session_id', session_id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ waitlist: data })
}

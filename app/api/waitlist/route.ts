import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWaitlistConfirmation, sendAdminWaitlistNotification } from '@/lib/email'

export async function POST(req: Request) {
  const { session_id, name, email, phone } = await req.json()
  if (!session_id || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })

  // Check not already on waitlist
  const { data: existing } = await supabaseAdmin.from('waitlist').select('id').eq('session_id', session_id).eq('email', email).single()
  if (existing) return NextResponse.json({ error: 'You are already on the waitlist' }, { status: 409 })

  // Atomic-safe MAX+1 — avoids broken RPC and race-safe enough for low-volume waitlist
  const { data: posData } = await supabaseAdmin
    .from('waitlist')
    .select('position')
    .eq('session_id', session_id)
    .order('position', { ascending: false })
    .limit(1)
  const position = ((posData?.[0]?.position) ?? 0) + 1

  const { data: entry, error } = await supabaseAdmin.from('waitlist').insert({ session_id, name, email, phone, position }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: session } = await supabaseAdmin.from('sessions').select('title, date, time, venue').eq('id', session_id).single()
  if (session) {
    sendWaitlistConfirmation({ to: email, name, position, sessionTitle: session.title, sessionDate: session.date }).catch(console.error)
    sendAdminWaitlistNotification({ name, email, phone, position, sessionTitle: session.title, sessionDate: session.date, sessionTime: session.time, venue: session.venue }).catch(console.error)
  }

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

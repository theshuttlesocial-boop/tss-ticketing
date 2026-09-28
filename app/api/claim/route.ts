import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

async function loadOffer(token: string) {
  const { data: row } = await supabaseAdmin
    .from('waitlist')
    .select('id,name,email,phone,status,claim_spaces,claim_expires_at,session_id')
    .eq('claim_token', token).maybeSingle()
  if (!row) return null
  const { data: session } = await supabaseAdmin
    .from('sessions').select('id,title,date,time,venue,label').eq('id', row.session_id).single()
  return { row, session }
}

// GET — the claim page reads the offer.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const loaded = await loadOffer(token)
  if (!loaded?.session) return NextResponse.json({ status: 'invalid' })

  const { row, session } = loaded
  let status: 'valid' | 'expired' | 'claimed' | 'invalid' = 'valid'
  if (row.status === 'claimed') status = 'claimed'
  else if (row.status !== 'offered') status = 'invalid'
  else if (!row.claim_expires_at || new Date(row.claim_expires_at) < new Date()) status = 'expired'

  return NextResponse.json({
    status,
    spaces: row.claim_spaces ?? 1,
    name: row.name, email: row.email, phone: row.phone,
    claimExpiresAt: row.claim_expires_at,
    session: { id: session.id, title: session.title, date: session.date, time: session.time, venue: session.venue, label: session.label },
  })
}

// POST — forfeit: revert a live offer to 'waiting' (lost the race, or declined).
// Their place on the list is kept; only reverts if still 'offered'.
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  await supabaseAdmin.from('waitlist')
    .update({ status: 'waiting', claim_token: null, claim_spaces: null, claim_expires_at: null })
    .eq('claim_token', token).eq('status', 'offered')
  return NextResponse.json({ success: true })
}

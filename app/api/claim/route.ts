import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runCascade } from '@/lib/waitlist-matcher'
import { isSessionDayLondon } from '@/lib/waitlist-alloc'

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
  let status: 'valid' | 'expired' | 'claimed' | 'declined' | 'withdrawn' | 'invalid' = 'valid'
  if (row.status === 'claimed') status = 'claimed'
  else if (row.status === 'declined') status = 'declined'
  else if (row.status === 'waiting') status = 'withdrawn'   // the owner took the offer back (Admin → Releases)
  else if (row.status !== 'offered') status = 'invalid'
  else if (!row.claim_expires_at || new Date(row.claim_expires_at) < new Date()) status = 'expired'

  return NextResponse.json({
    status,
    spaces: row.claim_spaces ?? 1,
    name: row.name, email: row.email, phone: row.phone,
    claimExpiresAt: row.claim_expires_at,
    // On the session day everyone on the waitlist is offered at once (first to pay wins);
    // before that, the space is held for this person until claimExpiresAt.
    competitive: isSessionDayLondon(session.date, new Date()),
    session: { id: session.id, title: session.title, date: session.date, time: session.time, venue: session.venue, label: session.label },
  })
}

// POST { token, action }:
//  - 'decline': "I can't make it". The offer ends, they leave this session's waitlist,
//    and the space goes straight to the next person (no waiting for it to expire).
//  - otherwise (lost the race on session day): back to 'waiting', keeping their place.
// Only acts on a live offer.
export async function POST(req: Request) {
  const { token, action } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const declining = action === 'decline'
  const { data: row } = await supabaseAdmin.from('waitlist')
    .update(declining
      ? { status: 'declined', claim_token: null, claim_spaces: null, claim_expires_at: null }
      : { status: 'waiting', claim_token: null, claim_spaces: null, claim_expires_at: null })
    .eq('claim_token', token).eq('status', 'offered')
    .select('session_id').maybeSingle()
  if (row?.session_id && declining) {
    const sid = row.session_id
    after(() => runCascade(sid).then(() => {}, (err) => console.error('[claim] cascade after decline failed:', err)))
  }
  return NextResponse.json({ success: true })
}

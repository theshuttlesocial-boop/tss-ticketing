import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const EVENTS = ['session_view', 'book_now_click']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Anonymous counts for Admin → Analytics: session views and "Book now" clicks (migration 027). */
export async function POST(req: Request) {
  try {
    const { session_id, event } = await req.json()
    if (!UUID.test(String(session_id)) || !EVENTS.includes(String(event))) return NextResponse.json({ ok: false }, { status: 400 })
    await supabaseAdmin.from('session_analytics').insert({ session_id, event })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

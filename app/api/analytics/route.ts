import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { session_id, event } = await req.json()
    if (!session_id || !event) return NextResponse.json({ ok: false }, { status: 400 })
    await supabaseAdmin.from('session_analytics').insert({ session_id, event })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

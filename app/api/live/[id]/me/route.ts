import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { cookieName, playerCookie } from '@/lib/live-session/pin'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Who is this phone in this session? Reads the httpOnly cookie set at
 * registration or PIN sign-in. While the session is running, each check
 * pushes the cookie's expiry 12 hours on, so it outlives the night by ~12 h.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  const pid = (await cookies()).get(cookieName(id))?.value
  if (!pid) return NextResponse.json({ player_id: null })
  const [{ data: p }, { data: s }] = await Promise.all([
    supabaseAdmin.from('live_session_players').select('id').eq('id', pid).eq('session_id', id).maybeSingle(),
    supabaseAdmin.from('live_sessions').select('status').eq('id', id).maybeSingle(),
  ])
  const res = NextResponse.json({ player_id: p?.id ?? null })
  if (!p) res.cookies.delete(cookieName(id))
  else if (s && s.status !== 'finished') res.cookies.set(playerCookie(id, p.id, new URL(req.url).protocol === 'https:'))
  return res
}

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/staff'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Admin → Inbox: Join us applications and suggestions from theshuttlesocial.com
 * (form_messages, migration 025). Owners and admins only.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('form_messages')
    .select('id,kind,name,email,fields,message,status,reviewed_by,reviewed_at,created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return NextResponse.json({ messages: [], missing: true, error: error.message })
  return NextResponse.json({ messages: data ?? [] })
}

// PATCH { id, status: 'reviewed' | 'new' }
export async function PATCH(req: Request) {
  const staff = await requireAdmin(req)
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id, status } = await req.json().catch(() => ({}))
  if (!id || !['reviewed', 'new'].includes(status)) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  const reviewed = status === 'reviewed'
  const { error } = await supabaseAdmin.from('form_messages').update({
    status,
    reviewed_by: reviewed ? (staff.email ?? 'owner (emergency password)') : null,
    reviewed_at: reviewed ? new Date().toISOString() : null,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

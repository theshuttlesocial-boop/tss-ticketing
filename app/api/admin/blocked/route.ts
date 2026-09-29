import { requireAdmin } from '@/lib/staff'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** Owners and admins (personal login, or the owner-only emergency password). */
async function checkAdmin(req: Request) {
  return !!(await requireAdmin(req))
}

export async function GET(req: Request) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('blocked_emails')
    .select('id,email,reason,created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ blocked: data ?? [] })
}

export async function POST(req: Request) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { email, reason } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('blocked_emails')
    .insert({ email: email.trim().toLowerCase(), reason: reason?.trim() || null })
    .select()
    .single()
  if (error) {
    if (error.message.includes('unique')) return NextResponse.json({ error: 'Email already blocked' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ blocked: data }, { status: 201 })
}

export async function DELETE(req: Request) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('blocked_emails').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

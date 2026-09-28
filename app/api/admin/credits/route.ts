import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

function checkAdmin(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

// GET — all credits, newest first (status computed client-side).
export async function GET(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('credits')
    .select('id,email,phone,amount_pence,created_at,expires_at,used_at,used_booking_id,source_booking_id')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ credits: data ?? [] })
}

// POST — issue a manual credit.
export async function POST(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { email, amountPence, phone } = await req.json().catch(() => ({}))
  const amount = Math.round(Number(amountPence))
  if (!email?.trim() || !Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: 'Valid email and amount required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('credits').insert({
    email: email.trim().toLowerCase(), phone: phone?.trim() || null, amount_pence: amount,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit('credit_issued_manual', { email: email.trim().toLowerCase(), amountPence: amount }, data.id)
  return NextResponse.json({ credit: data }, { status: 201 })
}

// DELETE ?id — void an UNUSED credit (removes it). Used credits can't be voided.
export async function DELETE(req: Request) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: credit } = await supabaseAdmin.from('credits').select('used_at').eq('id', id).maybeSingle()
  if (!credit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (credit.used_at) return NextResponse.json({ error: 'This credit has already been used and cannot be voided.' }, { status: 409 })

  const { error } = await supabaseAdmin.from('credits').delete().eq('id', id).is('used_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit('credit_voided', {}, id)
  return NextResponse.json({ success: true })
}

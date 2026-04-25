import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createPaymentIntent } from '@/lib/stripe'
import { nanoid } from 'nanoid'

export async function POST(req: Request) {
  const body = await req.json()
  const { session_id, quantity, name, email, phone, additional_attendees } = body

  if (!session_id || !quantity || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields including phone are required' }, { status: 400 })

  if (quantity < 1 || quantity > 4)
    return NextResponse.json({ error: 'Quantity must be 1–4' }, { status: 400 })

  if (quantity > 1 && (!additional_attendees || additional_attendees.length < quantity - 1))
    return NextResponse.json({ error: 'Please provide names for all additional attendees' }, { status: 400 })

  const holdToken  = nanoid(24)
  const bookingRef = 'TSS-' + nanoid(5).toUpperCase()

  const { data: holdResult, error: holdError } = await supabaseAdmin.rpc('claim_seat_hold', {
    p_session_id: session_id, p_quantity: quantity, p_hold_token: holdToken,
  })

  if (holdError) return NextResponse.json({ error: 'Could not process request' }, { status: 500 })
  if (!holdResult.success) return NextResponse.json({ error: holdResult.error, available: holdResult.available ?? 0 }, { status: 409 })

  const { data: session } = await supabaseAdmin.from('sessions').select('price_pence, title, label, date, time, venue, description').eq('id', session_id).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const totalPence = session.price_pence * quantity

  let paymentIntent
  try {
    paymentIntent = await createPaymentIntent({
      amountPence: totalPence, sessionId: session_id, holdToken, bookingRef,
      customerEmail: email, customerName: name,
    })
  } catch (err: any) {
    await supabaseAdmin.from('seat_holds').delete().eq('hold_token', holdToken)
    return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 })
  }

  await supabaseAdmin.from('bookings').insert({
    session_id, name, email, phone: phone ?? null,
    quantity, total_pence: totalPence,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_status: 'pending',
    booking_ref: bookingRef,
    additional_attendees: additional_attendees ? JSON.stringify(additional_attendees) : null,
  })

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret, holdToken, bookingRef,
    expiresAt: holdResult.expires_at, totalPence,
  })
}

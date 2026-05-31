import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createPaymentIntent, stripe } from '@/lib/stripe'
import { nanoid } from 'nanoid'

export async function POST(req: Request) {
  const body = await req.json()
  const { session_id, quantity, name, email, phone, additional_attendees } = body

  if (!session_id || !quantity || !name || !email || !phone)
    return NextResponse.json({ error: 'All fields including phone are required' }, { status: 400 })

  if (quantity < 1 || quantity > 10)
    return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })

  if (quantity > 1 && (!additional_attendees || additional_attendees.length < quantity - 1))
    return NextResponse.json({ error: 'Please provide names for all additional attendees' }, { status: 400 })

  // ── Dedup: return existing PaymentIntent if same email+session booked in last 10 min ──
  // Prevents double-charging if user taps "Continue" twice or retries after Apple Pay glitch
  const dedupeWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: existingBooking } = await supabaseAdmin
    .from('bookings')
    .select('stripe_payment_intent_id, booking_ref, total_pence, created_at')
    .eq('session_id', session_id)
    .eq('email', email)
    .eq('quantity', quantity)
    .eq('stripe_status', 'pending')
    .gte('created_at', dedupeWindow)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingBooking?.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(existingBooking.stripe_payment_intent_id)
      // Only reuse if still in a payable state (not already succeeded/cancelled)
      if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
        const holdToken = pi.metadata?.hold_token
        let expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString()
        if (holdToken) {
          const { data: hold } = await supabaseAdmin
            .from('seat_holds').select('expires_at').eq('hold_token', holdToken).single()
          if (hold?.expires_at) expiresAt = hold.expires_at
        }
        console.log('[book] dedup: returning existing PI for', email, session_id)
        return NextResponse.json({
          clientSecret: pi.client_secret, holdToken, bookingRef: existingBooking.booking_ref,
          expiresAt, totalPence: existingBooking.total_pence,
        })
      }
    } catch (e) {
      // If PI retrieval fails, fall through and create a fresh one
      console.warn('[book] dedup PI retrieval failed, creating fresh:', e)
    }
  }

  const holdToken  = nanoid(24)
  const bookingRef = 'TSS-' + nanoid(5).toUpperCase()

  const { data: holdResult, error: holdError } = await supabaseAdmin.rpc('claim_seat_hold', {
    p_session_id: session_id, p_quantity: quantity, p_hold_token: holdToken,
  })

  if (holdError) return NextResponse.json({ error: 'Could not process request' }, { status: 500 })
  if (!holdResult.success) return NextResponse.json({ error: holdResult.error, available: holdResult.available ?? 0 }, { status: 409 })

  const { data: session } = await supabaseAdmin.from('sessions').select('price_pence, title, label, date, time, venue, description, max_tickets_per_order').eq('id', session_id).single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const maxPerOrder = session.max_tickets_per_order ?? 4
  if (quantity > maxPerOrder)
    return NextResponse.json({ error: `Max ${maxPerOrder} tickets per order` }, { status: 400 })

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

import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const adminSecret = req.headers.get('x-admin-secret')
  if (adminSecret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { booking_id, reason } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { data: booking, error: bookingError } = await supabaseAdmin.from('bookings').select('*').eq('id', booking_id).single()
  if (bookingError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.stripe_status !== 'succeeded') return NextResponse.json({ error: 'Booking not eligible for refund' }, { status: 400 })
  if (!booking.stripe_payment_intent_id) return NextResponse.json({ error: 'No payment intent found' }, { status: 400 })

  try {
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: { booking_ref: booking.booking_ref, admin_reason: reason ?? 'Admin refund' }
    })

    await supabaseAdmin.from('bookings').update({ stripe_status: 'refunded' }).eq('id', booking_id)

    return NextResponse.json({ refund_id: refund.id, amount_refunded: refund.amount, status: refund.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

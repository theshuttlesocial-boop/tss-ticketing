import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { sendBookingConfirmation } from '@/lib/email'

export async function POST(req: Request) {
  const body    = await req.text()
  const sig     = req.headers.get('stripe-signature')!
  const secret  = process.env.STRIPE_WEBHOOK_SECRET!

  let event
  try { event = stripe.webhooks.constructEvent(body, sig, secret) }
  catch (err: any) { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as any
    const { hold_token, booking_ref, session_id, customer_name } = pi.metadata

    const { data: booking } = await supabaseAdmin
      .from('bookings').update({ stripe_status: 'succeeded' })
      .eq('stripe_payment_intent_id', pi.id).select().single()

    if (booking) {
      await supabaseAdmin.from('seat_holds').update({ used: true }).eq('hold_token', hold_token)

      const { data: session } = await supabaseAdmin.from('sessions').select('title,label,date,time,venue,description').eq('id', session_id).single()

      if (session) {
        const additionalAttendees = booking.additional_attendees
          ? (typeof booking.additional_attendees === 'string' ? JSON.parse(booking.additional_attendees) : booking.additional_attendees).map((a: any) => a.name ?? a)
          : undefined

        sendBookingConfirmation({
          to: booking.email,
          name: customer_name ?? booking.name,
          bookingRef: booking_ref,
          sessionTitle: session.title,
          sessionLabel: session.label,
          sessionDate: session.date,
          sessionTime: session.time,
          venue: session.venue,
          description: session.description,
          quantity: booking.quantity,
          totalPence: booking.total_pence,
          additionalAttendees,
        }).catch(console.error)
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const pi = event.data.object as any
    const { hold_token } = pi.metadata
    await supabaseAdmin.from('bookings').update({ stripe_status: 'failed' }).eq('stripe_payment_intent_id', pi.id)
    await supabaseAdmin.from('seat_holds').delete().eq('hold_token', hold_token)
  }

  return NextResponse.json({ received: true })
}

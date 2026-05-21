import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { sendBookingConfirmation, sendAdminBookingNotification, sendApologyRefundEmail } from '@/lib/email'

export async function POST(req: Request) {
  console.log('[webhook] POST received')

  const body    = await req.text()
  const sig     = req.headers.get('stripe-signature')!
  const secret  = process.env.STRIPE_WEBHOOK_SECRET!

  console.log('[webhook] STRIPE_WEBHOOK_SECRET set:', !!secret)
  console.log('[webhook] stripe-signature present:', !!sig)

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
    console.log('[webhook] signature verified, event type:', event.type)
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as any
    console.log('[webhook] payment_intent.succeeded, pi.id:', pi.id)
    console.log('[webhook] metadata:', JSON.stringify(pi.metadata))

    const { hold_token, booking_ref, session_id, customer_name } = pi.metadata

    // ── 1. Find the pending booking ──────────────────────────────────────────
    const { data: pendingBooking } = await supabaseAdmin
      .from('bookings').select('*')
      .eq('stripe_payment_intent_id', pi.id).single()

    if (!pendingBooking) {
      console.warn('[webhook] booking not found for pi.id:', pi.id)
      return NextResponse.json({ received: true })
    }

    // Idempotency: already processed
    if (pendingBooking.stripe_status === 'succeeded') {
      console.log('[webhook] booking already succeeded, skipping')
      return NextResponse.json({ received: true })
    }

    // ── 2. Capacity check before confirming ──────────────────────────────────
    //    This guards against expired holds that freed a slot which was re-sold.
    const [sessionRes, bookedRes] = await Promise.all([
      supabaseAdmin.from('sessions').select('capacity,title,label,date,time,venue,description').eq('id', session_id).single(),
      supabaseAdmin.from('bookings').select('quantity').eq('session_id', session_id).eq('stripe_status', 'succeeded'),
    ])

    const session = sessionRes.data
    const capacity = session?.capacity ?? 0
    const alreadyBooked = (bookedRes.data ?? []).reduce((a: number, b: any) => a + b.quantity, 0)

    console.log(`[webhook] capacity check: capacity=${capacity}, alreadyBooked=${alreadyBooked}, thisQty=${pendingBooking.quantity}`)

    if (alreadyBooked + pendingBooking.quantity > capacity) {
      // ── 2a. OVERSELL DETECTED — refund immediately ───────────────────────
      console.error(`[webhook] OVERSELL DETECTED for session ${session_id} — issuing refund for pi.id ${pi.id}`)

      try {
        await stripe.refunds.create({ payment_intent: pi.id })
        console.log('[webhook] refund created successfully')
      } catch (refundErr: any) {
        console.error('[webhook] refund creation failed:', refundErr.message)
        // Continue — still update DB status so we know what happened
      }

      await supabaseAdmin.from('bookings')
        .update({ stripe_status: 'refunded' })
        .eq('stripe_payment_intent_id', pi.id)

      sendApologyRefundEmail({
        to: pendingBooking.email,
        name: customer_name ?? pendingBooking.name,
        bookingRef: booking_ref,
        sessionTitle: session?.title ?? 'your session',
        sessionDate: session?.date ?? '',
        amountPence: pendingBooking.total_pence,
      }).catch(err => console.error('[webhook] apology email failed:', err))

      return NextResponse.json({ received: true })
    }

    // ── 3. Mark booking as succeeded ────────────────────────────────────────
    //    The DB trigger enforce_capacity is a hard backstop here — if a race
    //    condition slipped through the check above, the trigger will raise
    //    'capacity_exceeded' and this update will fail.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings').update({ stripe_status: 'succeeded' })
      .eq('stripe_payment_intent_id', pi.id).select().single()

    if (bookingError) {
      console.error('[webhook] booking update failed:', bookingError.message)

      // DB trigger caught a race-condition oversell
      if (bookingError.message.includes('capacity_exceeded') || bookingError.message.includes('capacity')) {
        console.error('[webhook] DB trigger blocked oversell — refunding pi.id:', pi.id)

        try {
          await stripe.refunds.create({ payment_intent: pi.id })
        } catch (refundErr: any) {
          console.error('[webhook] trigger-path refund failed:', refundErr.message)
        }

        await supabaseAdmin.from('bookings')
          .update({ stripe_status: 'refunded' })
          .eq('stripe_payment_intent_id', pi.id)

        sendApologyRefundEmail({
          to: pendingBooking.email,
          name: customer_name ?? pendingBooking.name,
          bookingRef: booking_ref,
          sessionTitle: session?.title ?? 'your session',
          sessionDate: session?.date ?? '',
          amountPence: pendingBooking.total_pence,
        }).catch(console.error)
      }

      return NextResponse.json({ received: true })
    }

    console.log('[webhook] booking confirmed — email:', booking.email, 'quantity:', booking.quantity)

    // ── 4. Mark hold as used (if it still exists — it may have expired) ──────
    await supabaseAdmin.from('seat_holds').update({ used: true }).eq('hold_token', hold_token)
    console.log('[webhook] seat hold marked used (or was already expired)')

    // ── 5. Send confirmation emails ──────────────────────────────────────────
    if (session) {
      const additionalAttendees = booking.additional_attendees
        ? (typeof booking.additional_attendees === 'string'
            ? JSON.parse(booking.additional_attendees)
            : booking.additional_attendees
          ).map((a: any) => a.name ?? a)
        : undefined

      console.log('[webhook] calling sendBookingConfirmation to:', booking.email)

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
      }).then(() => {
        console.log('[webhook] sendBookingConfirmation resolved OK')
      }).catch((err) => {
        console.error('[webhook] sendBookingConfirmation FAILED:', err)
      })

      sendAdminBookingNotification({
        name: customer_name ?? booking.name,
        email: booking.email,
        phone: booking.phone ?? undefined,
        bookingRef: booking_ref,
        sessionTitle: session.title,
        sessionDate: session.date,
        sessionTime: session.time,
        venue: session.venue,
        quantity: booking.quantity,
        totalPence: booking.total_pence,
        additionalAttendees,
      }).then(() => {
        console.log('[webhook] sendAdminBookingNotification resolved OK')
      }).catch((err) => {
        console.error('[webhook] sendAdminBookingNotification FAILED:', err)
      })
    } else {
      console.warn('[webhook] session not found for session_id:', session_id)
    }
  }

  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const pi = event.data.object as any
    const { hold_token } = pi.metadata
    console.log('[webhook] payment failed/canceled, cleaning up hold_token:', hold_token)
    await supabaseAdmin.from('bookings').update({ stripe_status: 'failed' }).eq('stripe_payment_intent_id', pi.id)
    await supabaseAdmin.from('seat_holds').delete().eq('hold_token', hold_token)
  }

  console.log('[webhook] returning 200 received: true')
  return NextResponse.json({ received: true })
}

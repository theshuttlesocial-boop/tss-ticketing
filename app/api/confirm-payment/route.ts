import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { sendBookingConfirmation } from '@/lib/email'

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

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings').update({ stripe_status: 'succeeded' })
      .eq('stripe_payment_intent_id', pi.id).select().single()

    console.log('[webhook] booking update result — found:', !!booking, 'error:', bookingError?.message ?? null)

    if (booking) {
      console.log('[webhook] booking email:', booking.email, 'quantity:', booking.quantity)

      await supabaseAdmin.from('seat_holds').update({ used: true }).eq('hold_token', hold_token)
      console.log('[webhook] seat hold marked used')

      const { data: session, error: sessionError } = await supabaseAdmin
        .from('sessions').select('title,label,date,time,venue,description').eq('id', session_id).single()

      console.log('[webhook] session fetch — found:', !!session, 'error:', sessionError?.message ?? null)

      if (session) {
        console.log('[webhook] session title:', session.title)

        const additionalAttendees = booking.additional_attendees
          ? (typeof booking.additional_attendees === 'string' ? JSON.parse(booking.additional_attendees) : booking.additional_attendees).map((a: any) => a.name ?? a)
          : undefined

        console.log('[webhook] calling sendBookingConfirmation to:', booking.email)
        console.log('[webhook] RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)
        console.log('[webhook] EMAIL_FROM:', process.env.EMAIL_FROM ?? '(not set)')

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
      } else {
        console.warn('[webhook] session not found for session_id:', session_id)
      }
    } else {
      console.warn('[webhook] booking not found for pi.id:', pi.id)
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

import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})
export async function createPaymentIntent({ amountPence, sessionId, holdToken, bookingRef, customerEmail, customerName }: any) {
  return stripe.paymentIntents.create({
    amount: amountPence, currency: 'gbp', receipt_email: customerEmail,
    metadata: { session_id: sessionId, hold_token: holdToken, booking_ref: bookingRef, customer_name: customerName },
    automatic_payment_methods: { enabled: true },
  })
}

import { NextResponse } from 'next/server'
import { availableCreditPence } from '@/lib/credits'

// Checkout looks up available credit for the entered email.
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get('email') ?? ''
  if (!email.trim()) return NextResponse.json({ availablePence: 0 })
  return NextResponse.json({ availablePence: await availableCreditPence(email) })
}

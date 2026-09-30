import { NextResponse } from 'next/server'
import { sendJoinWelcome } from '@/lib/email'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase'
import { FAQS } from '@/lib/site/faqs'
import { HEARD_FROM, WELCOME_MESSAGE } from '@/lib/site/join'
import { getWelcomeSettings } from '@/lib/welcome'

const clean = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim()
const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

/**
 * theshuttlesocial.com/join (Phase 8). Saves first name, email and how they heard about
 * us (join_requests, 12 months), emails a copy of the welcome message, then returns the
 * WhatsApp invite link (Admin → Settings), which is never sent to the browser any other way.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad('Something went wrong. Please try again.') }
  if (clean(body.website, 200)) return NextResponse.json({ inviteUrl: '' })   // bot trap

  const firstName = clean(body.firstName, 40)
  const email = clean(body.email, 200).toLowerCase()
  const heardFrom = HEARD_FROM.includes(String(body.heardFrom)) ? String(body.heardFrom) : 'Somewhere else'
  const src = clean(body.src, 30).replace(/[^a-z0-9_-]/gi, '') || null
  if (!firstName) return bad('Please add your first name.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Please check your email address.')
  if (body.consent !== true) return bad('Please tick the box to continue.')

  if (!(await allowReleaseLookup(`join:${clientIp(req)}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many tries from here. Please try again in an hour, or DM us on Instagram.' }, { status: 429 })
  }

  const w = await getWelcomeSettings()
  const { error } = await supabaseAdmin.from('join_requests').insert({ first_name: firstName, email, heard_from: heardFrom, src })
  if (error) console.error('[join] save failed', error.message)

  const offer = w.enabled && w.discountPence > 0
    ? { code: w.code, discount: `£${(w.discountPence / 100).toFixed(w.discountPence % 100 ? 2 : 0)}` }
    : undefined
  try {
    await sendJoinWelcome({ to: email, firstName, paragraphs: WELCOME_MESSAGE, inviteUrl: w.inviteUrl, faqs: FAQS.filter(([q]) => q !== 'How do I join?'), offer })
  } catch (e) {
    console.error('[join] welcome email failed', e)
  }
  return NextResponse.json({ inviteUrl: /^https:\/\//.test(w.inviteUrl) ? w.inviteUrl : '', code: offer?.code, discount: offer?.discount })
}

import { NextResponse } from 'next/server'
import { sendContactMessage } from '@/lib/email'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { AREAS, NIGHTS, TOPICS } from '@/lib/site/forms'

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+$/g, '').slice(0, max).trim()

/**
 * Website contact and volunteer forms (theshuttlesocial.com/contact, /volunteer).
 * Emails the club inbox with the sender as reply-to; nothing is stored. The sender must
 * tick consent. A hidden field catches bots, and each address can send 5 an hour.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 }) }

  // Bots fill every field, people never see this one: pretend it worked.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true })

  const kind = body.kind === 'volunteer' ? 'volunteer' : 'contact'
  const name = clean(body.name, 80)
  const email = clean(body.email, 200).toLowerCase()
  const message = clean(body.message, 3000)
  if (!name) return NextResponse.json({ error: 'Please add your name.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Please check your email address.' }, { status: 400 })
  if (kind === 'contact' && message.length < 5) return NextResponse.json({ error: 'Please write a message.' }, { status: 400 })
  if (body.consent !== true) return NextResponse.json({ error: 'Please tick the box so we can reply to you.' }, { status: 400 })

  const fields: [string, string][] = []
  if (kind === 'contact') {
    const topic = TOPICS.includes(String(body.topic)) ? String(body.topic) : 'General question'
    fields.push(['Topic', topic])
  } else {
    const nights = (Array.isArray(body.nights) ? body.nights : []).map(String).filter((n) => NIGHTS.includes(n))
    const area = AREAS.includes(String(body.area)) ? String(body.area) : 'Not given'
    fields.push(['Nights', nights.join(', ') || 'Not given'], ['Area', area])
  }

  // Shares the lookup limiter's table, under its own key so the counts don't mix.
  if (!(await allowReleaseLookup(`contact:${clientIp(req)}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many messages from here. Please try again in an hour, or DM us on Instagram.' }, { status: 429 })
  }

  try {
    await sendContactMessage({ kind, name, email, fields, message: message || '(No message)' })
  } catch (e) {
    console.error('[contact] send failed', e)
    return NextResponse.json({ error: 'We couldn’t send that just now. Please email theshuttlesocial@gmail.com instead.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}

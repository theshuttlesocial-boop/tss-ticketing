import { NextResponse } from 'next/server'
import { sendContactMessage } from '@/lib/email'
import { allowReleaseLookup, clientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase'
import { AREAS, JOIN_INTERESTS, JOIN_QUESTIONS, SUGGESTION_TOPICS, TOPICS } from '@/lib/site/forms'

const clean = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim()
const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

/**
 * Website forms on theshuttlesocial.com: contact, Join us (volunteering application) and
 * suggestions. Emails the club inbox (reply-to the sender when they gave an email); Join us
 * and suggestions are also saved for Admin → Inbox (deleted after 12 months). Consent is required whenever someone gives their details. A hidden
 * field catches bots, and each address can send 5 an hour.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad('Something went wrong. Please try again.') }

  // Bots fill every field, people never see this one: pretend it worked.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true })

  const kind = body.kind === 'join' ? 'join' : body.kind === 'suggestion' ? 'suggestion' : 'contact'
  const name = clean(body.name, 80)
  const email = clean(body.email, 200).toLowerCase()
  const message = clean(body.message, 3000)
  const anonymousOk = kind === 'suggestion'

  if (!name && !anonymousOk) return bad('Please add your name.')
  if ((email || !anonymousOk) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Please check your email address.')
  if (kind !== 'join' && message.length < 5) return bad(kind === 'suggestion' ? 'Please write your suggestion.' : 'Please write a message.')
  if ((email || !anonymousOk) && body.consent !== true) return bad('Please tick the box so we can reply to you.')

  const pick = (v: unknown, list: string[]) => (Array.isArray(v) ? v : []).map(String).filter((x) => list.includes(x))
  const fields: [string, string][] = []
  let text = message

  if (kind === 'contact') {
    fields.push(['Topic', TOPICS.includes(String(body.topic)) ? String(body.topic) : 'General question'])
  } else if (kind === 'suggestion') {
    fields.push(['Topic', SUGGESTION_TOPICS.includes(String(body.topic)) ? String(body.topic) : 'Something else'])
  } else {
    const interests = pick(body.interests, JOIN_INTERESTS)
    const other = clean(body.other, 120)
    if (!interests.length && !other) return bad('Please pick at least one area you’d like to help with.')
    const answers = (Array.isArray(body.answers) ? body.answers : []).map((a) => clean(a, 1500))
    const missing = JOIN_QUESTIONS.findIndex((_, k) => (answers[k] ?? '').length < 10)
    if (missing >= 0) return bad(`Please answer question ${missing + 1} (a sentence or two is fine).`)
    fields.push(
      ['Interested in', [...interests, ...(other ? [`Other: ${other}`] : [])].join(', ')],
      ['Area', AREAS.includes(String(body.area)) ? String(body.area) : 'Not given'],
    )
    text = JOIN_QUESTIONS.map((q, k) => `${k + 1}. ${q}\n${answers[k]}`).join('\n\n')
  }

  // Shares the lookup limiter's table, under its own key so the counts don't mix.
  if (!(await allowReleaseLookup(`contact:${clientIp(req)}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many messages from here. Please try again in an hour, or DM us on Instagram.' }, { status: 429 })
  }

  // Join us applications and suggestions also go to Admin → Inbox (migration 025), so
  // the team can mark them reviewed. It succeeds if either the inbox or the email worked.
  let stored = false
  if (kind !== 'contact') {
    const { error } = await supabaseAdmin.from('form_messages').insert({ kind, name: name || null, email: email || null, fields, message: text })
    if (error) console.error('[contact] inbox save failed', error.message)
    else stored = true
  }

  try {
    await sendContactMessage({ kind, name: name || 'Anonymous', email: email || undefined, fields, message: text })
  } catch (e) {
    console.error('[contact] send failed', e)
    if (!stored) return NextResponse.json({ error: 'We couldn’t send that just now. Please email theshuttlesocial@gmail.com instead.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}

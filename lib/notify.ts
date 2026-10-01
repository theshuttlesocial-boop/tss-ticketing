import { sendWaitlistOffer } from '@/lib/email'

// ── Phone normalisation ──────────────────────────────────────────────────────
// Existing waitlist rows store bare UK numbers like "7572341939". Normalise
// everything to E.164 before sending, defaulting to +44 (UK).
export function toE164(raw: string | null | undefined, defaultCc = '44'): string | null {
  if (!raw) return null
  const s = raw.replace(/[\s()\-.]/g, '')

  // Already international.
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '')
    return digits ? '+' + digits : null
  }
  // 00-prefixed international (e.g. 0044...).
  if (s.startsWith('00')) {
    const digits = s.slice(2).replace(/\D/g, '')
    return digits ? '+' + digits : null
  }

  const d = s.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0')) return '+' + defaultCc + d.slice(1)   // 07572... -> +447572...
  if (d.startsWith(defaultCc)) return '+' + d                  // 447572... -> +447572...
  return '+' + defaultCc + d                                   // 7572341939 -> +447572341939
}

// ── Channels ──────────────────────────────────────────────────────────────────
export type Channel = 'whatsapp' | 'sms' | 'email'

export interface NotifyArgs {
  to: { email: string; phone?: string | null; firstName?: string }
  template: string
  vars: Record<string, any>
  channels?: Channel[]  // fast-channel preference order; email always also sends
}

// Texts and WhatsApp go through Twilio (one account for both). Nothing is sent until the
// Vercel environment has TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and:
//   TWILIO_SMS_FROM            a Twilio UK number (+44…) or a sender name such as "TSS"
//   WHATSAPP_ENABLED=true, TWILIO_WHATSAPP_FROM (whatsapp:+44…) and
//   TWILIO_WHATSAPP_OFFER_TEMPLATE (the approved template's Content SID, HX…)
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const SMS_FROM = process.env.TWILIO_SMS_FROM
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true'
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM
const WHATSAPP_OFFER_TEMPLATE = process.env.TWILIO_WHATSAPP_OFFER_TEMPLATE

async function twilioSend(params: Record<string, string>): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return false
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[notify] twilio rejected message', res.status, (err as { code?: number; message?: string }).code, (err as { message?: string }).message)
    return false
  }
  return true
}

// Short UK date/time for messages: "Thu 2 Oct, 20:15".
function shortWhen(date: string, time: string) {
  const d = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  return `${d}, ${time}`
}
function untilTime(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null
}

// The text version of a waitlist offer. One link: the claim page also has "Can't make it?".
export function offerText(vars: Record<string, any>): string {
  const when = shortWhen(vars.sessionDate, vars.sessionTime)
  const until = untilTime(vars.expiresAt)
  const what = vars.spaces > 1 ? `${vars.spaces} spaces` : 'a space'
  return vars.competitive
    ? `The Shuttle Social: ${what} opened up for ${when}! Everyone on the waitlist has been told, first to pay gets it: ${vars.claimUrl}`
    : `The Shuttle Social: ${what} opened up for ${when}. It's held for you${until ? ` until ${until}` : ''}. Claim or pass it on: ${vars.claimUrl}`
}

async function sendWhatsApp(phoneE164: string, template: string, vars: Record<string, any>): Promise<boolean> {
  if (!WHATSAPP_ENABLED || !WHATSAPP_FROM || template !== 'waitlist_offer' || !WHATSAPP_OFFER_TEMPLATE) return false
  // WhatsApp only allows pre-approved templates for messages we start. Variables:
  // {{1}} first name, {{2}} "Thu 2 Oct, 20:15", {{3}} held-until time or "first to pay", {{4}} claim link.
  return twilioSend({
    From: WHATSAPP_FROM, To: `whatsapp:${phoneE164}`, ContentSid: WHATSAPP_OFFER_TEMPLATE,
    ContentVariables: JSON.stringify({
      1: vars.firstName ?? 'there',
      2: shortWhen(vars.sessionDate, vars.sessionTime),
      3: vars.competitive ? 'first to pay gets it' : `held for you until ${untilTime(vars.expiresAt) ?? 'soon'}`,
      4: vars.claimUrl,
    }),
  })
}

async function sendSMS(phoneE164: string, template: string, vars: Record<string, any>): Promise<boolean> {
  if (!SMS_FROM || template !== 'waitlist_offer') return false
  return twilioSend({ From: SMS_FROM, To: phoneE164, Body: offerText(vars) })
}

async function sendEmail(email: string, template: string, vars: Record<string, any>): Promise<void> {
  if (template === 'waitlist_offer') {
    await sendWaitlistOffer({
      to: email,
      name: vars.firstName ?? 'there',
      sessionTitle: vars.sessionTitle,
      sessionDate: vars.sessionDate,
      sessionTime: vars.sessionTime,
      venue: vars.venue,
      spaces: vars.spaces,
      claimUrl: vars.claimUrl,
      expiresMinutes: vars.expiresMinutes,
      competitive: !!vars.competitive,
      expiresAt: vars.expiresAt,
    })
  } else {
    console.warn('[notify] unknown email template:', template)
  }
}

// Send a notification. Email ALWAYS sends (in parallel). Fast channels are tried
// in preference order and stop at the first success; failures fall through.
export async function notify({ to, template, vars, channels = ['whatsapp', 'sms'] }: NotifyArgs): Promise<{ fastChannel: Channel | null }> {
  const emailPromise = to.email
    ? sendEmail(to.email, template, vars).catch(err => console.error('[notify] email failed:', err))
    : Promise.resolve()

  let fastChannel: Channel | null = null
  const phone = toE164(to.phone)
  if (phone) {
    for (const ch of channels) {
      try {
        const ok = ch === 'whatsapp' ? await sendWhatsApp(phone, template, vars)
                 : ch === 'sms'      ? await sendSMS(phone, template, vars)
                 : false
        if (ok) { fastChannel = ch; break }
      } catch (err) {
        console.error(`[notify] ${ch} failed, falling through:`, err)
      }
    }
  }

  await emailPromise
  return { fastChannel }
}

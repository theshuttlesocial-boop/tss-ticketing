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

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true'

// Provider hooks. No SMS/WhatsApp provider is configured yet, so these return
// false (delivery not sent) and the caller falls through — email always covers it.
async function sendWhatsApp(phoneE164: string, template: string, vars: Record<string, any>): Promise<boolean> {
  if (!WHATSAPP_ENABLED) return false
  // TODO: wire a WhatsApp Business provider here.
  console.log('[notify] whatsapp not configured; skipping', { phoneE164, template })
  return false
}

async function sendSMS(phoneE164: string, template: string, vars: Record<string, any>): Promise<boolean> {
  // TODO: wire an SMS provider (e.g. Twilio) here when credentials exist.
  console.log('[notify] sms not configured; skipping', { phoneE164, template })
  return false
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

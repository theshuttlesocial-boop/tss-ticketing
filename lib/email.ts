import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// V5 design (docs/design-brief.md), adapted for email clients: every gradient has a
// solid fallback, and the font falls back cleanly where web fonts aren't supported.
const brandColor = '#1E6B3E'   // forest: links and emphasis on the cream page
const bg = '#F6F7F1'           // cream page
const ink = '#0F2A1A'          // headings
const text = '#0F2A1A'
const muted = '#4A5A45'
const lime = '#D9F46B'
// Deep green details card (same look as the tickets page cards)
const cardText = '#F4F7EC'
const cardMuted = '#B9C9B4'
const cardLine = 'rgba(244,247,236,0.16)'
const cardInset = 'rgba(244,247,236,0.08)'
const deepCard = 'background:#0E3B24;background-image:linear-gradient(155deg,#0B2416 0%,#0E3B24 60%,#155A34 100%);border-radius:20px;padding:22px;'
const font = "'Urbanist','Helvetica Neue',Helvetica,Arial,sans-serif"
// Glowing lime main action (the Book button)
const cta = `display:inline-block;background:${lime};background-image:linear-gradient(115deg,#F2FF9E 0%,#D9F46B 45%,#9FE8BE 100%);color:#0F2A1A;font-weight:800;font-size:16px;text-decoration:none;padding:15px 30px;border-radius:999px;box-shadow:0 12px 28px -10px rgba(150,200,60,0.65);`

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tickets.theshuttlesocial.com'

function emailWrap(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light"/>
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;700;800;900&display=swap" rel="stylesheet"/></head>
<body style="margin:0;padding:0;background:${bg};font-family:${font};color:${text};">
<div style="max-width:560px;margin:0 auto;padding:20px 14px 32px;">
  <div style="background:#155A34;background-image:linear-gradient(135deg,#0B2E1B 0%,#155A34 45%,#2E9A5C 85%,#9BDB7A 100%);border-radius:28px;padding:26px 24px;margin-bottom:26px;">
    <a href="https://theshuttlesocial.com" style="color:${cardText};font-weight:900;font-size:22px;letter-spacing:-0.5px;text-decoration:none;">the shuttle social</a>
    <div style="color:${lime};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Social badminton · London</div>
  </div>
  <div style="padding:0 6px;">
  ${content}
  </div>
  <div style="border-top:1px solid #DDE4D3;margin-top:30px;padding:16px 6px 0;color:${muted};font-size:12px;line-height:1.7;">
    The Shuttle Social · <a href="https://theshuttlesocial.com" style="color:${brandColor};text-decoration:none;font-weight:700;">theshuttlesocial.com</a> · <a href="https://www.instagram.com/theshuttlesocial" style="color:${brandColor};text-decoration:none;font-weight:700;">@theshuttlesocial</a> · <a href="${APP_URL}/privacy" style="color:${brandColor};text-decoration:none;">Privacy</a>
  </div>
</div></body></html>`
}

// Rows inside the deep green details card.
function infoRow(label: string, value: string, highlight = false) {
  return `<tr><td style="padding:7px 0;color:${cardMuted};font-size:13px;">${label}</td><td style="text-align:right;color:${highlight ? lime : cardText};font-weight:${highlight ? 800 : 500};font-size:${highlight ? 17 : 14}px;">${value}</td></tr>`
}

// ── ICS calendar attachment ───────────────────────────────────────────────────

// Converts a YYYY-MM-DD + HH:MM pair, interpreted as Europe/London local time,
// into the equivalent UTC Date — handles BST/GMT automatically.
function ukLocalToUTCDate(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi))
  const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(guess)
  const ukH = parseInt(ukParts.find(p => p.type === 'hour')!.value)
  const ukMi = parseInt(ukParts.find(p => p.type === 'minute')!.value)
  const diffMs = ((h - ukH) * 60 + (mi - ukMi)) * 60000
  return new Date(guess.getTime() + diffMs)
}

// Formats a Date as a UTC ICS datetime: YYYYMMDDTHHMMSSZ
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// Escapes backslash, semicolon, comma and newline per RFC 5545 §3.3.11
function escapeICS(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function generateICS(session: {
  title: string; venue: string; date: string; time: string; bookingRef: string
}): string {
  const start = ukLocalToUTCDate(session.date, session.time)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Shuttle Social//Booking Confirmation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${session.bookingRef}@theshuttlesocial.com`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICS(session.title)}`,
    `LOCATION:${escapeICS(session.venue)}`,
    `DESCRIPTION:${escapeICS(`Booking ref: ${session.bookingRef}\nView your tickets: ${APP_URL}\n\nCan't make it? Release your spot: ${APP_URL}/release`)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n') + '\r\n'
}

export async function sendBookingConfirmation({ to, name, bookingRef, sessionTitle, sessionLabel, sessionDate, sessionTime, venue, description, quantity, totalPence, additionalAttendees }: {
  to: string; name: string; bookingRef: string; sessionTitle: string; sessionLabel?: string
  sessionDate: string; sessionTime: string; venue: string; description?: string
  quantity: number; totalPence: number; additionalAttendees?: string[]
}) {
  if (!resend) { console.log(`[Email] Confirmation for ${to} - set RESEND_API_KEY to enable`); return }

  const fmt = (p: number) => `£${(p/100).toFixed(2)}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  const attendeeSection = additionalAttendees?.length ? `
    <div style="margin-top:12px;padding:12px 14px;background:${cardInset};border-radius:14px;font-size:13px;color:${cardMuted};">
      <div style="font-weight:700;color:${cardText};margin-bottom:6px;">All attendees:</div>
      <div style="color:${cardText};">${name}</div>
      ${additionalAttendees.map(a => `<div style="color:${cardText};">${a}</div>`).join('')}
    </div>` : ''

  const descSection = description ? `
    <div style="margin-top:12px;padding:12px 14px;background:${cardInset};border-radius:14px;font-size:13px;color:${cardMuted};line-height:1.6;border-left:3px solid ${lime};">
      ${description}
    </div>` : ''

  const ics = generateICS({ title: sessionTitle, venue, date: sessionDate, time: sessionTime, bookingRef })

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Booking confirmed: ${sessionTitle} - Ref ${bookingRef}`,
    attachments: [{
      filename: 'tss-session.ics',
      content: Buffer.from(ics, 'utf-8').toString('base64'),
      content_type: 'text/calendar',
    }],
    html: emailWrap(`
      <div style="color:${ink};font-size:26px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">You're in, ${name}!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">Your spot is confirmed. See you on court!</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Session', sessionTitle)}
          ${sessionLabel ? infoRow('Location', `${sessionLabel} London`) : ''}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
          ${infoRow('Tickets', `${quantity} x ${fmt(totalPence/quantity)}`)}
          <tr style="border-top:1px solid ${cardLine};">
            <td style="padding:10px 0 0;color:${cardMuted};font-size:13px;">Total paid</td>
            <td style="text-align:right;color:${lime};font-weight:700;font-size:20px;padding-top:10px;">${fmt(totalPence)}</td>
          </tr>
        </table>
        ${attendeeSection}
        ${descSection}
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Please bring this email or your booking ref <strong style="color:${text};">${bookingRef}</strong> to the session.<br/>
        Questions? Message us on Instagram <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
      <div style="margin-top:22px;padding:16px;background:#E6EFDD;border-radius:18px;text-align:center;">
        <div style="color:${muted};font-size:12px;margin-bottom:6px;">Can't make it?</div>
        <a href="${APP_URL}/release" style="color:${brandColor};font-size:13px;font-weight:700;text-decoration:none;">Release your spot &rarr;</a>
        <div style="color:${muted};font-size:11px;margin-top:6px;line-height:1.5;">Free up your place for the waitlist. You're only refunded once someone takes it.</div>
      </div>
    `)
  })
}

export async function sendAdminBookingNotification({ name, email, phone, bookingRef, sessionTitle, sessionDate, sessionTime, venue, quantity, totalPence, additionalAttendees }: {
  name: string; email: string; phone?: string; bookingRef: string
  sessionTitle: string; sessionDate: string; sessionTime: string; venue: string
  quantity: number; totalPence: number; additionalAttendees?: string[]
}) {
  if (!resend) return

  const fmt = (p: number) => `£${(p/100).toFixed(2)}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  const attendeeSection = additionalAttendees?.length ? `
    <div style="margin-top:12px;padding:12px 14px;background:${cardInset};border-radius:14px;font-size:13px;color:${cardMuted};">
      <div style="font-weight:700;color:${cardText};margin-bottom:6px;">All attendees:</div>
      <div style="color:${cardText};">${name} (lead)</div>
      ${additionalAttendees.map(a => `<div style="color:${cardText};">${a}</div>`).join('')}
    </div>` : ''

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: 'theshuttlesocial@gmail.com',
    subject: `New booking: ${sessionTitle} - ${name} (${quantity} ticket${quantity > 1 ? 's' : ''})`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">New Booking</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">A player just confirmed their spot.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${cardMuted};letter-spacing:2px;margin-bottom:10px;">SESSION</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="${deepCard}margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${cardMuted};letter-spacing:2px;margin-bottom:10px;">PLAYER</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Name', name)}
          ${infoRow('Email', email)}
          ${phone ? infoRow('Phone', phone) : ''}
          ${infoRow('Tickets', `${quantity} x ${fmt(totalPence/quantity)}`)}
          <tr style="border-top:1px solid ${cardLine};">
            <td style="padding:10px 0 0;color:${cardMuted};font-size:13px;">Total paid</td>
            <td style="text-align:right;color:${lime};font-weight:700;font-size:20px;padding-top:10px;">${fmt(totalPence)}</td>
          </tr>
          ${infoRow('Booking ref', bookingRef, true)}
        </table>
        ${attendeeSection}
      </div>
    `)
  })
}

export async function sendAdminWaitlistNotification({ name, email, phone, position, sessionTitle, sessionDate, sessionTime, venue }: {
  name: string; email: string; phone?: string; position: number
  sessionTitle: string; sessionDate: string; sessionTime: string; venue: string
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: 'theshuttlesocial@gmail.com',
    subject: `Waitlist: ${name} joined - ${sessionTitle} (#${position})`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">New Waitlist Entry</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">Someone joined the waitlist for a sold-out session.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${cardMuted};letter-spacing:2px;margin-bottom:10px;">SESSION</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="${deepCard}">
        <div style="font-size:11px;font-weight:700;color:${cardMuted};letter-spacing:2px;margin-bottom:10px;">PLAYER</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Name', name)}
          ${infoRow('Email', email)}
          ${phone ? infoRow('Phone', phone) : ''}
          ${infoRow('Waitlist position', `#${position}`, true)}
        </table>
      </div>
    `)
  })
}

export async function sendWaitlistConfirmation({ to, name, position, sessionTitle, sessionDate }: {
  to: string; name: string; position: number; sessionTitle: string; sessionDate: string
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Waitlist confirmed - #${position} for ${sessionTitle}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">You're on the waitlist!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="${deepCard}margin-bottom:16px;text-align:center;">
        <div style="font-size:48px;font-weight:900;color:${lime};">#${position}</div>
        <div style="color:${cardMuted};font-size:14px;">Your position on the waitlist</div>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Hi <strong style="color:${text};">${name}</strong>, we'll email you immediately if a spot opens up. You don't need to do anything - we'll contact you directly.<br/><br/>
        Questions? Message us <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
    `)
  })
}

export async function sendApologyRefundEmail({ to, name, bookingRef, sessionTitle, sessionDate, amountPence }: {
  to: string; name: string; bookingRef: string; sessionTitle: string; sessionDate: string; amountPence: number
}) {
  if (!resend) return
  const fmt = (p: number) => `£${(p/100).toFixed(2)}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Important: Full refund issued - ${sessionTitle} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Important: Refund Issued</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">We're very sorry - please read this carefully.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Refund amount', fmt(amountPence), true)}
        </table>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.8;">
        Hi <strong style="color:${text};">${name}</strong>,<br/><br/>
        We're very sorry to inform you that due to a technical issue, this session became fully booked before your payment was processed. We have automatically issued a full refund of <strong style="color:${brandColor};">${fmt(amountPence)}</strong> which will appear in your account within 5-10 business days.<br/><br/>
        We sincerely apologise for this inconvenience. Please message us on Instagram <strong style="color:${brandColor};">@theshuttlesocial</strong> and we'll do everything we can to get you into the next available session.
      </div>
    `)
  })
}

// ── Release magic link: emailed so only the inbox owner can manage a booking ─
export async function sendReleaseMagicLink({ to, url }: { to: string; url: string }) {
  if (!resend) { console.log(`[Email] Release magic link for ${to}: ${url}`); return }
  const fromAddr = process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com'
  await resend.emails.send({
    // Display name + reply-to improve inbox placement (primary, not spam).
    from: `The Shuttle Social <${fromAddr}>`,
    to,
    reply_to: fromAddr,
    subject: 'Manage your Shuttle Social booking',
    // Plain-text alternative also helps deliverability.
    text: `Hi,\n\nTap this link to manage your booking (release your spot, transfer it, or request credit/refund):\n\n${url}\n\nThis link works for 30 minutes and can only be used from your inbox. If you didn't request it, you can ignore this email.\n\nThe Shuttle Social`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Manage your booking</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">You asked to make a change to your spot. Tap below to continue.</div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${url}" style="${cta}">Manage my booking &rarr;</a>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        This secure link works for 30 minutes and only from your inbox. If you didn't request it, just ignore this email - nothing will change.
      </div>
    `)
  })
}

// ── Waitlist offer: a spot has opened, claim within the window ───────────────
export async function sendWaitlistOffer({ to, name, sessionTitle, sessionDate, sessionTime, venue, spaces, claimUrl, expiresMinutes }: {
  to: string; name: string; sessionTitle: string; sessionDate: string; sessionTime: string
  venue: string; spaces: number; claimUrl: string; expiresMinutes: number
}) {
  if (!resend) { console.log(`[Email] Waitlist offer for ${to} - set RESEND_API_KEY to enable`); return }
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `A spot opened up! ${sessionTitle}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">A spot just opened up!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">You're off the waitlist, ${name} - if you're quick.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
          ${infoRow('Spaces held for you', String(spaces), true)}
        </table>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${claimUrl}" style="${cta}">Claim your spot &rarr;</a>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;text-align:center;">
        This offer is first-come, first-served and expires in about ${expiresMinutes} minutes. If someone else claims it first, you'll stay on the list.
      </div>
    `)
  })
}

// ── Release confirmation (routes B credit / C card) ─────────────────────────
// Sent to the releaser after they open their spot to the waitlist. Explicit
// that no money moves until someone actually takes the spot.
export async function sendReleaseConfirmation({ to, name, bookingRef, sessionTitle, sessionDate, spaces, refundPreference }: {
  to: string; name: string; bookingRef: string; sessionTitle: string; sessionDate: string
  spaces: number; refundPreference: 'credit' | 'card'
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const routeLine = refundPreference === 'credit'
    ? "If someone takes it, you'll receive store credit for the full value, valid 90 days."
    : "If someone takes it, we'll refund your card for the released spot(s)."
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Spot released - ${sessionTitle} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Your spot is now open</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Spaces released', String(spaces))}
          ${infoRow('You chose', refundPreference === 'credit' ? 'Credit for a future session' : 'Refund to card')}
        </table>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.8;">
        Hi <strong style="color:${text};">${name}</strong>,<br/><br/>
        Your spot is now open to the waitlist. <strong style="color:${text};">You'll only be refunded once someone takes it.</strong> ${routeLine}<br/><br/>
        If nobody claims it before the session starts, we can't refund it and your original booking stands.<br/><br/>
        Questions? Message us <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
    `)
  })
}

// ── Settlement: store credit issued (someone took the released spot) ─────────
export async function sendCreditIssued({ to, name, amountPence, expiresAt, bookingRef }: {
  to: string; name: string; amountPence: number; expiresAt: string; bookingRef: string
}) {
  if (!resend) return
  const fmt = (p: number) => `£${(p/100).toFixed(2)}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Your ${fmt(amountPence)} credit is ready`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Someone took your spot</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">Your credit is now available for a future session.</div>
      <div style="${deepCard}margin-bottom:16px;text-align:center;">
        <div style="font-size:40px;font-weight:900;color:${lime};">${fmt(amountPence)}</div>
        <div style="color:${cardMuted};font-size:13px;">credit · use by ${fmtDate(expiresAt)}</div>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.8;">
        Hi <strong style="color:${text};">${name}</strong>, thanks for releasing your spot (ref ${bookingRef}). Your credit applies automatically at checkout next time you book with this email - just look for the "apply credit" option.
      </div>
    `)
  })
}

// ── Settlement: card refund issued ───────────────────────────────────────────
export async function sendCardRefundIssued({ to, name, amountPence, feePence, bookingRef }: {
  to: string; name: string; amountPence: number; feePence: number; bookingRef: string
}) {
  if (!resend) return
  const fmt = (p: number) => `£${(p/100).toFixed(2)}`
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `Refund issued: ${fmt(amountPence)} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Someone took your spot</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">We've refunded your card.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Refunded to card', fmt(amountPence), true)}
          ${feePence > 0 ? infoRow('Admin fee', fmt(feePence)) : ''}
        </table>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.8;">
        Hi <strong style="color:${text};">${name}</strong>, your refund of <strong style="color:${brandColor};">${fmt(amountPence)}</strong> will appear in your account within 5-10 business days.${feePence > 0 ? ' A small admin fee applied as this was a repeat card refund - choosing credit avoids it next time.' : ''}
      </div>
    `)
  })
}

// ── Release went unfilled: no replacement found by session start ─────────────
export async function sendReleaseUnfilled({ to, name, bookingRef, sessionTitle, sessionDate, spaces }: {
  to: string; name: string; bookingRef: string; sessionTitle: string; sessionDate: string; spaces: number
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `No replacement found - ${sessionTitle} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">We couldn't fill your spot</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Spaces offered', String(spaces))}
        </table>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.8;">
        Hi <strong style="color:${text};">${name}</strong>,<br/><br/>
        Nobody took the spot(s) you released before the session, so as explained when you released, <strong style="color:${text};">no refund or credit is due</strong> and your original booking still stands - you're welcome to come along.<br/><br/>
        Questions? Message us <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
    `)
  })
}

// ── Name-change transfer: ask the incoming person to confirm ────────────────
export async function sendTransferConfirmRequest({ toEmail, toName, fromName, sessionTitle, sessionDate, sessionTime, venue, confirmUrl }: {
  toEmail: string; toName: string; fromName: string; sessionTitle: string
  sessionDate: string; sessionTime: string; venue: string; confirmUrl: string
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: toEmail,
    subject: `${fromName} wants to give you their spot - ${sessionTitle}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">You've been offered a spot!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;"><strong style="color:${text};">${fromName}</strong> would like you to take their place.</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${confirmUrl}" style="${cta}">Confirm my place &rarr;</a>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Hi <strong style="color:${text};">${toName}</strong>, tap the button above to accept. This link expires in 24 hours. If you didn't expect this, you can ignore it - nothing happens until you confirm.
      </div>
    `)
  })
}

// ── Name-change transfer completed: notify both parties ─────────────────────
export async function sendTransferComplete({ fromEmail, fromName, toEmail, toName, sessionTitle, sessionDate, sessionTime, venue, bookingRef }: {
  fromEmail: string; fromName: string; toEmail: string; toName: string
  sessionTitle: string; sessionDate: string; sessionTime: string; venue: string; bookingRef: string
}) {
  if (!resend) return
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const detail = `
    <div style="${deepCard}margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        ${infoRow('Booking ref', bookingRef, true)}
        ${infoRow('Session', sessionTitle)}
        ${infoRow('Date', fmtDate(sessionDate))}
        ${infoRow('Time', sessionTime)}
        ${infoRow('Venue', venue)}
      </table>
    </div>`

  // Incoming person: now holds the spot.
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: toEmail,
    subject: `You're confirmed: ${sessionTitle} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">You're in, ${toName}!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${fromName} has transferred their spot to you.</div>
      ${detail}
      <div style="color:${muted};font-size:13px;line-height:1.7;">Bring this email or the booking ref to the session. See you on court!</div>
    `)
  }).catch(() => {})

  // Releaser: transfer done.
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: fromEmail,
    subject: `Transfer complete - ${sessionTitle} - Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Transfer complete</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;"><strong style="color:${text};">${toName}</strong> has accepted your spot.</div>
      ${detail}
      <div style="color:${muted};font-size:13px;line-height:1.7;">Hi ${fromName}, your place is now theirs - nothing more to do. Thanks for letting us know in good time.</div>
    `)
  }).catch(() => {})
}

// ── Staff invitation (Phase 5c) ──────────────────────────────────────────────
export async function sendStaffInvite({ to, role, invitedBy }: { to: string; role: 'owner' | 'admin' | 'session_lead'; invitedBy: string | null }) {
  const what = role === 'session_lead' ? 'a session lead' : role === 'owner' ? 'an owner' : 'an admin'
  const where = role === 'session_lead' ? `${APP_URL}/lead` : `${APP_URL}/admin`
  const signIn = `${APP_URL}/account?next=${encodeURIComponent(role === 'session_lead' ? '/lead' : '/admin')}`
  if (!resend) { console.log(`[Email] Staff invite for ${to} (${role}): ${signIn}`); return }
  const fromAddr = process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com'
  await resend.emails.send({
    from: `The Shuttle Social <${fromAddr}>`,
    to,
    reply_to: fromAddr,
    subject: `You've been added to The Shuttle Social team`,
    text: `Hi,\n\n${invitedBy ?? 'The Shuttle Social'} has added you as ${what}.\n\nSign in with this email address (we'll email you a code, no password):\n${signIn}\n\nAfter that, your page is ${where}\n\nThe Shuttle Social`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">Welcome to the team</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">${invitedBy ?? 'The Shuttle Social'} has added you as ${what}.</div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${signIn}" style="${cta}">Sign in &rarr;</a>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Sign in with this email address — we'll send you a code, there's no password.${role === 'session_lead' ? ' You\'ll see the sessions you run, on the day.' : ''}
      </div>
    `)
  })
}

// ── Website contact and volunteer forms ──────────────────────────────────────
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Sends a website form to the club inbox; replying goes straight to the sender when they gave an email. Nothing is stored. */
export async function sendContactMessage({ kind, name, email, fields, message }: {
  kind: 'contact' | 'join' | 'suggestion'; name: string; email?: string; fields: [string, string][]; message: string
}) {
  const title = kind === 'join' ? 'New Join us application' : kind === 'suggestion' ? 'New suggestion' : 'New message'
  const topic = fields[0]?.[1] ?? 'General'
  const subject = kind === 'join' ? `Join us: ${name}` : kind === 'suggestion' ? `Suggestion: ${topic}` : `Website message: ${topic} - ${name}`
  if (!resend) { console.log(`[Email] ${subject} - set RESEND_API_KEY to enable`); return }
  const fromAddr = process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com'
  const replyNote = email ? `Reply to this email to answer ${escHtml(name)}.` : 'Sent anonymously: there is no email to reply to.'
  const rows = [['Name', name], ['Email', email ?? 'Not given'], ...fields].map(([k, v]) => infoRow(escHtml(k), escHtml(v))).join('')
  const { error } = await resend.emails.send({
    from: `The Shuttle Social website <${fromAddr}>`,
    to: 'theshuttlesocial@gmail.com',
    ...(email ? { reply_to: email } : {}),
    subject,
    text: `${title} from the website\n\nName: ${name}\nEmail: ${email ?? 'Not given'}\n${fields.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${message}`,
    html: emailWrap(`
      <div style="color:${ink};font-size:22px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:4px;">${title}</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">From the website. ${replyNote}</div>
      <div style="${deepCard}margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
      <div style="color:${text};font-size:15px;line-height:1.7;white-space:pre-wrap;">${escHtml(message)}</div>
    `),
  })
  if (error) throw new Error(error.message)
}

// ── /join: a copy of the welcome message, with the WhatsApp invite (Phase 8) ─
export async function sendJoinWelcome({ to, firstName, paragraphs, inviteUrl, faqs, offer }: {
  to: string; firstName: string; paragraphs: string[]; inviteUrl: string; faqs: [string, string][]
  offer?: { code: string; discount: string }
}) {
  if (!resend) { console.log(`[Email] Join welcome for ${to} - set RESEND_API_KEY to enable`); return }
  const fromAddr = process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com'
  const safeUrl = /^https:\/\//.test(inviteUrl) ? inviteUrl : ''
  const { error } = await resend.emails.send({
    from: `The Shuttle Social <${fromAddr}>`,
    to,
    reply_to: 'theshuttlesocial@gmail.com',
    subject: 'Welcome to The Shuttle Social',
    text: `Hi ${firstName},\n\n${paragraphs.join('\n\n')}\n\n${safeUrl ? `Join the WhatsApp community: ${safeUrl}\n\n` : ''}${offer ? `New to our sessions? Use ${offer.code} for ${offer.discount} off your first booking: https://theshuttlesocial.com/welcome\n\n` : ''}${faqs.map(([q, a]) => `${q}\n${a}`).join('\n\n')}\n\nThe Shuttle Social`,
    html: emailWrap(`
      <div style="color:${ink};font-size:24px;font-weight:900;letter-spacing:-0.5px;line-height:1.15;margin-bottom:14px;">Hi ${escHtml(firstName)}, welcome!</div>
      ${paragraphs.map((p) => `<p style="color:${text};font-size:15px;line-height:1.7;margin:0 0 12px;">${escHtml(p)}</p>`).join('')}
      ${safeUrl ? `<div style="text-align:center;margin:22px 0;"><a href="${escHtml(safeUrl)}" style="${cta}">Join the WhatsApp community &rarr;</a></div>` : ''}
      ${offer ? `<div style="${deepCard}margin:18px 0;">
        <div style="font-size:11px;font-weight:700;color:${cardMuted};letter-spacing:2px;margin-bottom:8px;">NEW TO OUR SESSIONS?</div>
        <div style="color:${cardText};font-size:15px;line-height:1.6;">Use <strong style="color:${lime};font-size:18px;">${escHtml(offer.code)}</strong> for ${escHtml(offer.discount)} off your first booking. <a href="https://theshuttlesocial.com/welcome" style="color:${lime};font-weight:700;">Book your first session</a></div>
      </div>` : ''}
      <div style="color:${ink};font-size:17px;font-weight:900;margin:24px 0 8px;">FAQs</div>
      ${faqs.map(([q, a]) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${text};"><strong>${escHtml(q)}</strong><br/>${escHtml(a)}</p>`).join('')}
    `),
  })
  if (error) throw new Error(error.message)
}

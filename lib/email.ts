import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const brandColor = '#6fcf40'
const bg = '#080f08'
const card = '#0f180f'
const text = '#edf5ed'
const muted = '#6b8a6b'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tickets.theshuttlesocial.com'

function emailWrap(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${bg};font-family:system-ui,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;background:#142014;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:18px;font-weight:900;text-align:center;color:${brandColor};letter-spacing:1px;">TSS</div>
    <div style="color:${brandColor};font-weight:900;font-size:20px;margin-top:8px;letter-spacing:1px;">THE SHUTTLE SOCIAL</div>
    <div style="color:${muted};font-size:11px;letter-spacing:2px;">BADMINTON FOR EVERYONE</div>
  </div>
  ${content}
  <div style="border-top:1px solid #1e3220;margin-top:28px;padding-top:16px;text-align:center;color:${muted};font-size:11px;">
    The Shuttle Social · London Badminton · Instagram: @theshuttlesocial
  </div>
</div></body></html>`
}

function infoRow(label: string, value: string, highlight = false) {
  return `<tr><td style="padding:7px 0;color:${muted};font-size:13px;">${label}</td><td style="text-align:right;color:${highlight ? brandColor : text};font-weight:${highlight ? 700 : 400};font-size:${highlight ? 17 : 13}px;">${value}</td></tr>`
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
    <div style="margin-top:12px;padding:10px 14px;background:#142014;border-radius:8px;font-size:13px;color:${muted};">
      <div style="font-weight:600;color:${text};margin-bottom:6px;">All attendees:</div>
      <div style="color:${text};">${name}</div>
      ${additionalAttendees.map(a => `<div style="color:${text};">${a}</div>`).join('')}
    </div>` : ''

  const descSection = description ? `
    <div style="margin-top:12px;padding:12px 14px;background:#142014;border-radius:8px;font-size:13px;color:${muted};line-height:1.6;border-left:3px solid ${brandColor}44;">
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
      <div style="color:${brandColor};font-size:26px;font-weight:900;margin-bottom:4px;">You're in, ${name}!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">Your spot is confirmed. See you on court!</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Session', sessionTitle)}
          ${sessionLabel ? infoRow('Location', `${sessionLabel} London`) : ''}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
          ${infoRow('Tickets', `${quantity} x ${fmt(totalPence/quantity)}`)}
          <tr style="border-top:1px solid #1e3220;">
            <td style="padding:10px 0 0;color:${muted};font-size:13px;">Total paid</td>
            <td style="text-align:right;color:${brandColor};font-weight:700;font-size:20px;padding-top:10px;">${fmt(totalPence)}</td>
          </tr>
        </table>
        ${attendeeSection}
        ${descSection}
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Please bring this email or your booking ref <strong style="color:${text};">${bookingRef}</strong> to the session.<br/>
        Questions? Message us on Instagram <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
      <div style="margin-top:20px;padding:12px 14px;background:#142014;border-radius:8px;text-align:center;">
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
    <div style="margin-top:12px;padding:10px 14px;background:#142014;border-radius:8px;font-size:13px;color:${muted};">
      <div style="font-weight:600;color:${text};margin-bottom:6px;">All attendees:</div>
      <div style="color:${text};">${name} (lead)</div>
      ${additionalAttendees.map(a => `<div style="color:${text};">${a}</div>`).join('')}
    </div>` : ''

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to: 'theshuttlesocial@gmail.com',
    subject: `New booking: ${sessionTitle} - ${name} (${quantity} ticket${quantity > 1 ? 's' : ''})`,
    html: emailWrap(`
      <div style="color:${brandColor};font-size:22px;font-weight:900;margin-bottom:4px;">New Booking</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">A player just confirmed their spot.</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${muted};letter-spacing:2px;margin-bottom:10px;">SESSION</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${muted};letter-spacing:2px;margin-bottom:10px;">PLAYER</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Name', name)}
          ${infoRow('Email', email)}
          ${phone ? infoRow('Phone', phone) : ''}
          ${infoRow('Tickets', `${quantity} x ${fmt(totalPence/quantity)}`)}
          <tr style="border-top:1px solid #1e3220;">
            <td style="padding:10px 0 0;color:${muted};font-size:13px;">Total paid</td>
            <td style="text-align:right;color:${brandColor};font-weight:700;font-size:20px;padding-top:10px;">${fmt(totalPence)}</td>
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
      <div style="color:${brandColor};font-size:22px;font-weight:900;margin-bottom:4px;">New Waitlist Entry</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">Someone joined the waitlist for a sold-out session.</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:${muted};letter-spacing:2px;margin-bottom:10px;">SESSION</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;">
        <div style="font-size:11px;font-weight:700;color:${muted};letter-spacing:2px;margin-bottom:10px;">PLAYER</div>
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">You're on the waitlist!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">
        <div style="font-size:48px;font-weight:900;color:${brandColor};">#${position}</div>
        <div style="color:${muted};font-size:14px;">Your position on the waitlist</div>
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">Important: Refund Issued</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">We're very sorry - please read this carefully.</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">A spot just opened up!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">You're off the waitlist, ${name} - if you're quick.</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
          ${infoRow('Spaces held for you', String(spaces), true)}
        </table>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${claimUrl}" style="display:inline-block;background:${brandColor};color:#080f08;font-weight:800;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:10px;">Claim your spot &rarr;</a>
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">Your spot is now open</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
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
      <div style="color:${brandColor};font-size:22px;font-weight:900;margin-bottom:4px;">We couldn't fill your spot</div>
      <div style="color:${muted};font-size:14px;margin-bottom:20px;">${sessionTitle} - ${fmtDate(sessionDate)}</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">You've been offered a spot!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;"><strong style="color:${text};">${fromName}</strong> would like you to take their place.</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Session', sessionTitle)}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
        </table>
      </div>
      <div style="text-align:center;margin-bottom:16px;">
        <a href="${confirmUrl}" style="display:inline-block;background:${brandColor};color:#080f08;font-weight:800;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:10px;">Confirm my place &rarr;</a>
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
    <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">You're in, ${toName}!</div>
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
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">Transfer complete</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;"><strong style="color:${text};">${toName}</strong> has accepted your spot.</div>
      ${detail}
      <div style="color:${muted};font-size:13px;line-height:1.7;">Hi ${fromName}, your place is now theirs - nothing more to do. Thanks for letting us know in good time.</div>
    `)
  }).catch(() => {})
}

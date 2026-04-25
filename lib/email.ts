import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const brandColor = '#6fcf40'
const bg = '#080f08'
const card = '#0f180f'
const text = '#edf5ed'
const muted = '#6b8a6b'

function emailWrap(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${bg};font-family:system-ui,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;background:#142014;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;">🏸</div>
    <div style="color:${brandColor};font-weight:900;font-size:20px;margin-top:8px;letter-spacing:1px;">THE SHUTTLE SOCIAL</div>
    <div style="color:${muted};font-size:11px;letter-spacing:2px;">BADMINTON FOR EVERYONE · LONDON</div>
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

export async function sendBookingConfirmation({ to, name, bookingRef, sessionTitle, sessionLabel, sessionDate, sessionTime, venue, description, quantity, totalPence, additionalAttendees }: {
  to: string; name: string; bookingRef: string; sessionTitle: string; sessionLabel?: string
  sessionDate: string; sessionTime: string; venue: string; description?: string
  quantity: number; totalPence: number; additionalAttendees?: string[]
}) {
  if (!resend) { console.log(`[Email] Confirmation for ${to} — set RESEND_API_KEY to enable`); return }

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

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'bookings@theshuttlesocial.com',
    to,
    subject: `✅ You're booked! ${sessionTitle} — Ref ${bookingRef}`,
    html: emailWrap(`
      <div style="color:${brandColor};font-size:26px;font-weight:900;margin-bottom:4px;">You're in, ${name}! 🏸</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">Your spot is confirmed. See you on court!</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          ${infoRow('Booking ref', bookingRef, true)}
          ${infoRow('Session', sessionTitle)}
          ${sessionLabel ? infoRow('Location', `${sessionLabel} London`) : ''}
          ${infoRow('Date', fmtDate(sessionDate))}
          ${infoRow('Time', sessionTime)}
          ${infoRow('Venue', venue)}
          ${infoRow('Tickets', `${quantity} × ${fmt(totalPence/quantity)}`)}
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
    subject: `🎯 You're #${position} on the waitlist — ${sessionTitle}`,
    html: emailWrap(`
      <div style="color:${brandColor};font-size:24px;font-weight:900;margin-bottom:4px;">You're on the waitlist!</div>
      <div style="color:${muted};font-size:14px;margin-bottom:24px;">${sessionTitle} · ${fmtDate(sessionDate)}</div>
      <div style="background:${card};border:1px solid #1e3220;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">
        <div style="font-size:48px;font-weight:900;color:${brandColor};">#${position}</div>
        <div style="color:${muted};font-size:14px;">Your position on the waitlist</div>
      </div>
      <div style="color:${muted};font-size:13px;line-height:1.7;">
        Hi <strong style="color:${text};">${name}</strong>, we'll email you immediately if a spot opens up. You don't need to do anything — we'll contact you directly.<br/><br/>
        Questions? Message us <strong style="color:${brandColor};">@theshuttlesocial</strong>
      </div>
    `)
  })
}

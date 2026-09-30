import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy — The Shuttle Social',
  description: 'What The Shuttle Social collects, why, who it is shared with, how long it is kept, and your rights.',
}

// Colours come from the V5 design system (AppFrame), so the page follows light/dark mode.
const C = { bg:'var(--page)', card:'var(--card)', border:'var(--line)', text:'var(--ink)', muted:'var(--muted)', accent:'var(--accent)' }
const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontSize:19, fontWeight:800, margin:'28px 0 8px' }}>{children}</h2>
const P = ({ children }: { children: React.ReactNode }) => <p style={{ margin:'0 0 10px' }}>{children}</p>
const CONTACT = 'theshuttlesocial@gmail.com'

/**
 * Privacy notice (UK GDPR). Plain English. If you change what the site
 * collects, update this page in the same change.
 */
export default function PrivacyPage() {
  return (
    <main style={{ color:C.text, fontFamily:'inherit',
      padding:'28px 18px 60px', boxSizing:'border-box', fontSize:15, lineHeight:1.6 }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <a href="/tickets" style={{ color:C.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
        <h1 style={{ fontSize:38, fontWeight:900, letterSpacing:'-0.03em', margin:'14px 0 4px' }}>Privacy</h1>
        <p style={{ color:C.muted, margin:'0 0 8px' }}>Last updated 30 September 2026</p>
        <P>
          The Shuttle Social (&ldquo;we&rdquo;) runs social badminton sessions in London and this website. We are responsible
          for your personal data. Questions or requests: <a href={`mailto:${CONTACT}`} style={{ color:C.accent }}>{CONTACT}</a>.
        </P>

        <H>What we collect and why</H>
        <ul style={{ paddingLeft:20, margin:0 }}>
          <li><strong>Booking a session:</strong> your name, email, optional phone number, the session and number of spaces,
            and payment status. We need these to take your booking, email your confirmation, check you in and contact you if a
            session changes (to perform our contract with you). Card payments are handled by Stripe; we never see or store your card details.</li>
          <li><strong>Waitlist, releasing or transferring a space, and credits:</strong> your name, email and the session, so we can
            offer spaces and give credit (contract).</li>
          <li><strong>Live sessions on the night:</strong> the name you enter, the level you pick, your court, partners, opponents
            and scores, and a rating worked out from your results — to run fair, well-matched games (our legitimate interest in
            running the session, and yours in good games). A 4-digit PIN lets you back into your page; we store only a scrambled
            version of it, never the PIN itself.</li>
          <li><strong>A TSS account (optional):</strong> your email, name and level, so you can sign in and see your bookings and
            games (contract). Showing you on the public leaderboard happens only if you turn it on (consent), and you can turn it off at any time.</li>
          <li><strong>Contact and volunteer forms on theshuttlesocial.com:</strong> your name, email, what you tell us, and for volunteers
            which nights and area suit you, so we can reply. You tick a box to agree before sending. The message is emailed to our
            inbox; it isn&apos;t stored on the website or added to a mailing list. We note your IP address for up to 1 month to stop spam.</li>
          <li><strong>Emails:</strong> booking confirmations, sign-in codes and messages about sessions you booked. We don&apos;t send marketing emails.</li>
        </ul>
        <P>We only collect what these need. We don&apos;t collect your date of birth, address or anything about your health.</P>

        <H>Who can see what</H>
        <P>
          Other players see your first name (and last initial if two people share a name), your court and your scores.
          Your rating and level are shown only to you and the organisers — unless you join the public leaderboard, where
          other players who have also joined can see your rating.
        </P>

        <H>Who we share it with</H>
        <P>Only the services that run the site, each under contract and only for that purpose:</P>
        <ul style={{ paddingLeft:20, margin:'0 0 10px' }}>
          <li><strong>Stripe</strong> — payments and refunds.</li>
          <li><strong>Supabase</strong> — our database and sign-in.</li>
          <li><strong>Vercel</strong> — hosts the website.</li>
          <li><strong>Resend</strong> — sends our emails.</li>
          <li><strong>Google (Gmail)</strong> — our email inbox, where contact and volunteer messages arrive.</li>
          <li><strong>Google Maps</strong> — the venue map on the booking page is loaded from Google, which may set its own cookies when it loads.</li>
        </ul>
        <P>We never sell your data or share it with advertisers.</P>

        <H>Cookies and storage on your device</H>
        <P>
          We use no advertising or tracking cookies. We use only what the site needs to work: a cookie that remembers which
          player you are on the night of a live session (it expires about 12 hours later), your sign-in if you have a TSS
          account, and — if you choose — your booking details saved on your device so you don&apos;t retype them. Our page
          statistics count clicks on &ldquo;Book now&rdquo; without recording who clicked. The Google map is described above.
        </P>

        <H>How long we keep it</H>
        <ul style={{ paddingLeft:20, margin:0 }}>
          <li><strong>Bookings and payments:</strong> 6 years, because UK tax law requires it. After that your name, email and
            phone are deleted automatically; only the anonymous amounts stay.</li>
          <li><strong>Waitlist entries:</strong> 1 year, then deleted automatically.</li>
          <li><strong>&ldquo;Manage my booking&rdquo; email links and &ldquo;find my booking&rdquo; attempts</strong> (which record your IP address, to stop
            people guessing emails): 1 month.</li>
          <li><strong>Contact and volunteer messages:</strong> in our inbox only as long as we need them to reply or to organise volunteering, then deleted.</li>
          <li><strong>TSS accounts:</strong> while you use them. After 3 years with no sign-in, booking or session, the account is deleted
            automatically and your live-session results become &ldquo;Former player&rdquo;.</li>
          <li><strong>Live-session results without an account:</strong> kept as the record of that session. Ask us and we&apos;ll replace your name with &ldquo;Former player&rdquo;.</li>
          <li><strong>Failed PIN attempts:</strong> 1 day.</li>
        </ul>

        <H>Your rights</H>
        <P>
          You can ask for a copy of your data, ask us to correct it, delete it, or stop using it, and object to how we use it.
          If you have an account, <a href="/account" style={{ color:C.accent }}>My portal</a> lets you download your data and delete your
          account yourself. Deleting your account removes your sign-in and account, and your live-session results become
          &ldquo;Former player&rdquo; so other people&apos;s results stay correct. Payment records are kept for the 6 years the law requires.
          For anything else, email <a href={`mailto:${CONTACT}`} style={{ color:C.accent }}>{CONTACT}</a>; we&apos;ll reply within one month.
        </P>
        <P>
          If you&apos;re unhappy with how we&apos;ve handled your data, you can complain to the Information Commissioner&apos;s Office
          (<a href="https://ico.org.uk/make-a-complaint/" style={{ color:C.accent }}>ico.org.uk</a>). We&apos;d appreciate the chance to sort it out first.
        </P>
      </div>
    </main>
  )
}

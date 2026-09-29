import type { Metadata } from 'next'
import { RATING_V2 } from '@/lib/rating-v2/config'

export const metadata: Metadata = {
  title: 'How your rating works — The Shuttle Social',
  description: 'The TSS Rating in plain English: where you start, how each game moves it, and why beating a stronger pair counts for more.',
}

const C = { bg:'#080f08', card:'#0f180f', border:'#1e3220', text:'#edf5ed', muted:'#8aa88a', accent:'#6fcf40' }
const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontSize:19, fontWeight:800, margin:'26px 0 8px' }}>{children}</h2>
const P = ({ children }: { children: React.ReactNode }) => <p style={{ margin:'0 0 10px' }}>{children}</p>

/** Plain-English explainer for players. Numbers come from lib/rating-v2/config.ts, so it can't drift. */
export default function RatingsPage() {
  const s = RATING_V2.start, v = RATING_V2.volatility
  return (
    <main style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'DM Sans, system-ui, sans-serif',
      padding:'28px 18px 60px', boxSizing:'border-box', fontSize:15, lineHeight:1.6 }}>
      <div style={{ maxWidth:640, margin:'0 auto' }}>
        <a href="/tickets" style={{ color:C.muted, fontSize:14, textDecoration:'none' }}>← Sessions</a>
        <h1 style={{ fontSize:32, fontWeight:900, margin:'14px 0 6px' }}>How your rating works</h1>
        <p style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', color:C.muted, fontSize:14 }}>
          We&apos;re trying this rating out behind the scenes before switching over, so what you see on the night may
          still use the older one for a few more weeks.
        </p>
        <P>
          Your TSS rating is one number that follows you from session to session. We use it to put you on courts with
          people at your level, so games are close and fun. It&apos;s based on the way Badminton England rates doubles players.
          Only you can see your rating — unless you choose to join the <a href="/leaderboard" style={{ color:C.accent }}>leaderboard</a>.
        </P>

        <H>Where you start</H>
        <P>
          From the level you pick: Beginner {s.beginner}, Standard {s.standard}, Intermediate {s.intermediate}, Strong {s.strong}.
          If you picked the wrong level, the organiser can set a better starting point. Nobody goes below {RATING_V2.floor}.
        </P>

        <H>What moves it</H>
        <P>
          Before each game we work out how likely your pair is to win, from your rating, your partner&apos;s and your opponents&apos;.
          Your own rating counts for more than your partner&apos;s (60 / 40). Then:
        </P>
        <ul style={{ paddingLeft:20, margin:'0 0 10px' }}>
          <li><strong>Win when you weren&apos;t expected to</strong> — your rating goes up a lot.</li>
          <li><strong>Win when you were expected to</strong> — it goes up a little. Against a pair rated 75+ below you, not at all.</li>
          <li><strong>Lose to a much stronger pair</strong> — it barely moves.</li>
          <li><strong>A timed game that ends level</strong> — counts as half a win.</li>
        </ul>

        <H>How much each game counts</H>
        <ul style={{ paddingLeft:20, margin:'0 0 10px' }}>
          <li>Our games are one game to 21, so each counts as half a match — like Badminton England&apos;s single-end matches.</li>
          <li>A game won by {RATING_V2.weight.closeMargin} points or fewer counts half again: it was nearly a coin toss.</li>
          <li>The grand final counts like any game. Just-for-fun rounds don&apos;t count at all.</li>
        </ul>

        <H>New players move faster</H>
        <P>
          For your first {v.settledAfter} games your rating moves quickly, so it finds your level fast. After that it settles:
          by {v.settledAfter + (1 - v.minFactor) / v.shrinkPerGame} games each result moves it half as much. Until you&apos;ve
          played {RATING_V2.newUntilGames} games you show as <strong>New</strong>. Away for more than {RATING_V2.inactiveDays} days?
          It moves quickly again for your next {RATING_V2.inactiveBoostGames} games while you get back into it. It never
          drops just because you&apos;ve been away.
        </P>

        <H>Fair to everyone</H>
        <P>
          Results against people with lots of games behind them count fully; against brand-new players, less — their rating
          is still a guess. If a score is corrected, every rating is worked out again from the start, so nothing is lost.
          If someone played in your place, that game doesn&apos;t count for you.
        </P>
        <p style={{ color:C.muted, fontSize:13, marginTop:24 }}>
          Questions? Ask an organiser on the night, or email theshuttlesocial@gmail.com.
        </p>
      </div>
    </main>
  )
}

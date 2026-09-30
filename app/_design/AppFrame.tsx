import { AppHeader } from './AppHeader'
import BareFrame from './BareFrame'

/**
 * Layout for player pages (My portal, release, claim, transfer, leaderboard, privacy,
 * ratings): V5 design system, dark mode, and a compact green header.
 * Use as a route's layout: `export { default } from '@/app/_design/AppFrame'`.
 */
export default function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <BareFrame>
      <a className="skip" href="#main-content">Skip to main content</a>
      <AppHeader />
      <div id="main-content">{children}</div>
    </BareFrame>
  )
}

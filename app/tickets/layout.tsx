import { urbanist } from '@/app/_design/font'
import { themeScript } from '@/app/_design/ThemeToggle'
import '@/app/_design/tss.css'
import './tickets.css'

// The tickets page uses the same design system as theshuttlesocial.com (docs/design-brief.md).
export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tss ${urbanist.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      {children}
    </div>
  )
}

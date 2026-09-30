import type { Metadata } from 'next'
import { Urbanist } from 'next/font/google'
import { themeScript } from './_components/ThemeToggle'
import './site.css'

// Self-hosted by Next, swapped in without blocking text.
const urbanist = Urbanist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-urbanist',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://theshuttlesocial.com'),
  title: { default: 'The Shuttle Social · Social badminton in London', template: '%s · The Shuttle Social' },
  description: 'Social badminton in West London for every level. Come on your own: we match you to close games and a new partner every round. £10, no membership.',
  applicationName: 'The Shuttle Social',
  openGraph: { type: 'website', siteName: 'The Shuttle Social', locale: 'en_GB', url: '/' },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`tss ${urbanist.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <a className="skip" href="#main">Skip to content</a>
      {children}
    </div>
  )
}

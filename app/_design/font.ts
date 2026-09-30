import { Urbanist } from 'next/font/google'

// The one typeface (docs/design-brief.md). Self-hosted by Next, swapped in without blocking text.
// Defined once here so every layout that uses it shares the same font files.
export const urbanist = Urbanist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-urbanist',
  display: 'swap',
})

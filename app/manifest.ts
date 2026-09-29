import type { MetadataRoute } from 'next'

/**
 * Installable web app (Roadmap Phase 4c). Opens on My TSS, full screen with
 * no browser bars. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Shuttle Social',
    short_name: 'TSS',
    description: 'Book badminton sessions, see your games and follow tonight’s courts.',
    id: '/account',
    start_url: '/account?source=app',
    scope: '/',
    display: 'standalone',
    background_color: '#080f08',
    theme_color: '#080f08',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Book a session', url: '/tickets' },
      { name: 'Tonight’s session', url: '/live/latest' },
      { name: 'My games', url: '/account/history' },
    ],
  }
}

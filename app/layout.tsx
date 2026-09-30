// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { AppShell } from './_components/AppShell'

export const metadata: Metadata = {
  title: 'The Shuttle Social — Book Badminton Sessions',
  description: 'Book your spot at The Shuttle Social badminton sessions across London.',
  applicationName: 'The Shuttle Social',
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // iPhone "Add to Home Screen": full screen, named TSS.
  appleWebApp: { capable: true, title: 'TSS', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = { themeColor: '#080f08' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the marketing site sets its theme/JS flags on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;900&display=swap" rel="stylesheet"/>
      </head>
      <body style={{ margin:0, padding:0, background:'#0a0a0a' }}><AppShell />{children}</body>
    </html>
  )
}

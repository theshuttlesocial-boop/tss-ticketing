// app/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'The Shuttle Social — Book Badminton Sessions',
  description: 'Book your spot at The Shuttle Social badminton sessions across London.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;900&display=swap" rel="stylesheet"/>
      </head>
      <body style={{ margin:0, padding:0, background:'#0a0a0a' }}>{children}</body>
    </html>
  )
}

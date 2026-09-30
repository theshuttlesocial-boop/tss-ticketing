import { AppHeader } from '@/app/_design/AppHeader'

// Live-session page with the compact green header (court and TV screens leave it out).
export default function WithHeader({ children }: { children: React.ReactNode }) {
  return <><AppHeader />{children}</>
}

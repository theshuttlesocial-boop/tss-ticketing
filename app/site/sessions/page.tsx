import { permanentRedirect } from 'next/navigation'

// Sessions are on the homepage ("This week"); full listings are on the tickets page.
export default function Sessions() {
  permanentRedirect('/#sessions')
}

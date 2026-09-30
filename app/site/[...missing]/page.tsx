import { notFound } from 'next/navigation'

// Any unknown address on the marketing site gets the site's own 404 (app/site/not-found.tsx).
export default function Missing() {
  notFound()
}

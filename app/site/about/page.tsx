import { permanentRedirect } from 'next/navigation'

// About us is the "Our story" section of the homepage.
export default function About() {
  permanentRedirect('/#story')
}

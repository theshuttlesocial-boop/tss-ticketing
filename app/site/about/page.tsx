import { permanentRedirect } from 'next/navigation'

// About now lives on the Sessions page, with the story.
export default function About() {
  permanentRedirect('/sessions#story')
}

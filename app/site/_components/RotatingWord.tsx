'use client'
import { useEffect, useState } from 'react'

/**
 * The highlighted word in the hero headline. Purely visual: the heading carries
 * the full sentence for screen readers, and it stays still for reduced motion.
 */
export function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((n) => (n + 1) % words.length), interval)
    return () => clearInterval(id)
  }, [words.length, interval])

  return (
    <span className="word-box">
      <span className="word" key={words[i]}>{words[i]}</span>
      <span className="handle" style={{ left: '-0.44rem', top: '-0.44rem' }} />
      <span className="handle" style={{ right: '-0.44rem', bottom: '-0.44rem' }} />
    </span>
  )
}

'use client'
import { useEffect, useState } from 'react'

const KEY = 'tss-theme'
/** The app screens (My portal, live, staff, admin) keep their own choice: they're dark unless the visitor picks light. */
const APP_KEY = 'tss-app-theme'

/**
 * Website and tickets: follows the device setting until the visitor picks.
 * App screens (`app`): dark until the visitor picks light. The choice is remembered in this browser only.
 */
export function ThemeToggle({ app = false }: { app?: boolean }) {
  const [dark, setDark] = useState<boolean | null>(null)

  useEffect(() => {
    const set = document.documentElement.dataset.theme
    setDark(set ? set === 'dark' : app || matchMedia('(prefers-color-scheme: dark)').matches)
  }, [app])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem(app ? APP_KEY : KEY, next ? 'dark' : 'light') } catch { /* private mode */ }
  }

  return (
    <button type="button" className="theme-btn" onClick={toggle} aria-pressed={dark ?? undefined} aria-label="Dark mode">
      <svg className="i-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F7EC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      <svg className="i-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D9F46B" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    </button>
  )
}

/**
 * Runs before first paint: applies a saved theme (no flash of the wrong one) and marks
 * that JavaScript is on, which is what lets reveal-on-scroll hide content until it's shown.
 */
export const themeScript = `(function(){var d=document.documentElement;d.classList.add('tss-js');try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')d.dataset.theme=t}catch(e){}})()`
/** Same for app screens, with their own saved choice (none saved = dark, set in app.css). */
export const appThemeScript = `(function(){var d=document.documentElement;d.classList.add('tss-js');delete d.dataset.theme;try{var t=localStorage.getItem('${APP_KEY}');if(t==='light'||t==='dark')d.dataset.theme=t}catch(e){}})()`

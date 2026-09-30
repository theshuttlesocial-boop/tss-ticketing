'use client'
import { useEffect } from 'react'

/** Registers the service worker (production only, so local dev never serves stale pages). */
export function AppShell() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    // The marketing site (theshuttlesocial.com) is not the app: no offline shell there.
    if (!location.hostname.startsWith('tickets.') && location.hostname.endsWith('theshuttlesocial.com')) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* unsupported / blocked */ })
  }, [])
  return null
}

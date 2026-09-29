'use client'
import { useEffect } from 'react'

/** Registers the service worker (production only, so local dev never serves stale pages). */
export function AppShell() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* unsupported / blocked */ })
  }, [])
  return null
}

/*
 * The Shuttle Social service worker (Roadmap Phase 4c). Deliberately small:
 *  - pages always come from the network, so nobody ever sees an old draw or
 *    an old booking; only when there is no connection is the offline page shown
 *  - icons and the offline page are cached so the app opens without signal
 *  - API responses (bookings, ratings, anything personal) are NEVER cached
 * Bump VERSION to replace the cache.
 */
const VERSION = 'tss-v1'
const SHELL = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline')))
    return
  }
  if (url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
  }
})

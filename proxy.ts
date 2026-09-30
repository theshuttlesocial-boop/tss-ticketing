import { NextRequest, NextResponse } from 'next/server'

/**
 * One Vercel project, two sites:
 *   theshuttlesocial.com          → marketing site (pages live under app/site)
 *   www.theshuttlesocial.com      → 301 to the apex
 *   tickets.theshuttlesocial.com  → the ticketing app, unchanged
 * Local dev and Vercel previews behave like the tickets host; the marketing
 * site is at /site there.
 */
const APEX = 'theshuttlesocial.com'
const TICKETS_HOST = 'tickets.theshuttlesocial.com'

// App areas that only exist on the tickets host. (/privacy and /ratings move to the
// marketing site in a later stage; until then they are served from the app.)
const APP_PATHS = ['/tickets', '/account', '/live', '/lead', '/staff', '/admin', '/claim', '/release', '/transfer', '/leaderboard', '/offline', '/privacy', '/ratings']
const isAppPath = (p: string) => APP_PATHS.some((a) => p === a || p.startsWith(a + '/'))
const isSitePath = (p: string) => p === '/site' || p.startsWith('/site/')

export function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const { pathname, search } = req.nextUrl

  if (host === 'www.' + APEX) {
    return NextResponse.redirect(`https://${APEX}${pathname}${search}`, 301)
  }

  if (host === APEX) {
    // Old or shared links to ticketing pages go to the tickets host.
    if (isAppPath(pathname)) return NextResponse.redirect(`https://${TICKETS_HOST}${pathname}${search}`, 308)
    // One public address per page: /site/faq → /faq. (Generated share images keep their /site URL.)
    if (isSitePath(pathname) && !pathname.includes('opengraph-image')) return NextResponse.redirect(`https://${APEX}${pathname.slice(5) || '/'}${search}`, 301)
    if (isSitePath(pathname)) return NextResponse.next()
    const url = req.nextUrl.clone()
    url.pathname = '/site' + (pathname === '/' ? '' : pathname)
    return NextResponse.rewrite(url)
  }

  if (host === TICKETS_HOST && isSitePath(pathname) && !pathname.includes('opengraph-image')) {
    return NextResponse.redirect(`https://${APEX}${pathname.slice(5) || '/'}${search}`, 301)
  }

  // Tickets host, previews and local dev: the root opens the tickets page.
  if (pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/tickets'
    return NextResponse.redirect(url, 307)
  }

  return NextResponse.next()
}

export const config = {
  // API routes (including the Stripe webhook's raw body), build output and static files never go through the proxy.
  matcher: ['/((?!api/|_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)'],
}

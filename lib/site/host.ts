import { headers } from 'next/headers'

export const SITE_URL = 'https://theshuttlesocial.com'
export const TICKETS_URL = 'https://tickets.theshuttlesocial.com'

/** True when the request came in on the marketing domain (www is redirected before this runs). */
export async function isMarketingHost() {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0]
  return host === 'theshuttlesocial.com'
}

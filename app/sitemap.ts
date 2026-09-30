import type { MetadataRoute } from 'next'
import { isMarketingHost, SITE_URL, TICKETS_URL } from '@/lib/site/host'

// One sitemap per domain (a sitemap may only list its own host's pages).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await isMarketingHost()) {
    return [
      { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
      { url: `${SITE_URL}/community`, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${SITE_URL}/join`, changeFrequency: 'monthly', priority: 0.5 },
      { url: `${SITE_URL}/join-us`, changeFrequency: 'monthly', priority: 0.4 },
      { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.4 },
      { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    ]
  }
  return [
    { url: `${TICKETS_URL}/tickets`, changeFrequency: 'daily', priority: 1 },
    { url: `${TICKETS_URL}/leaderboard`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${TICKETS_URL}/ratings`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${TICKETS_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}

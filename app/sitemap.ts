import type { MetadataRoute } from 'next'
import { isMarketingHost, SITE_URL, TICKETS_URL } from '@/lib/site/host'

// One sitemap per domain (a sitemap may only list its own host's pages).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await isMarketingHost()) {
    return [{ url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 }]
  }
  return [
    { url: `${TICKETS_URL}/tickets`, changeFrequency: 'daily', priority: 1 },
    { url: `${TICKETS_URL}/leaderboard`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${TICKETS_URL}/ratings`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${TICKETS_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}

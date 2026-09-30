import type { MetadataRoute } from 'next'
import { isMarketingHost, SITE_URL, TICKETS_URL } from '@/lib/site/host'

// Served on both domains; each points at its own sitemap. Private app areas stay out of search.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (await isMarketingHost()) ? SITE_URL : TICKETS_URL
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/staff', '/lead', '/live', '/account', '/claim', '/release', '/transfer', '/offline'] },
    sitemap: `${base}/sitemap.xml`,
  }
}

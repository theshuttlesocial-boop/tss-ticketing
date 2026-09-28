import { supabaseAdmin } from '@/lib/supabase'

// Best-effort client IP from the proxy chain. Vercel sets x-forwarded-for.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

// DB-backed fixed-window limiter (shared across serverless instances, unlike an
// in-memory map). Returns true when the attempt is allowed.
export async function allowReleaseLookup(ip: string, max = 5, windowMinutes = 15): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  // Self-cleaning: drop this IP's stale rows first.
  await supabaseAdmin.from('release_lookup_attempts').delete().eq('ip', ip).lt('created_at', since)

  const { count } = await supabaseAdmin
    .from('release_lookup_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since)

  // Record this attempt regardless, so repeated blocked hits keep the window hot.
  await supabaseAdmin.from('release_lookup_attempts').insert({ ip })

  return (count ?? 0) < max
}

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

  // Old rows are kept for a month, then removed by the nightly retention job
  // (migration 024), which the owner can switch off in Admin → Settings.
  const { count } = await supabaseAdmin
    .from('release_lookup_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since)

  // Record this attempt regardless, so repeated blocked hits keep the window hot.
  await supabaseAdmin.from('release_lookup_attempts').insert({ ip })

  return (count ?? 0) < max
}

// Flood guard for public waitlist sign-ups. Shares the attempts table under a
// "waitlist:" key prefix, so it needs no migration of its own.
// The cap (20 per 10 minutes per IP) is more than twice the busiest real moment
// for ALL customers combined (9 joins in 10 minutes, measured 2026-10-01), so
// customers sharing a mobile network's IP can't hit it. Fails open: a database
// hiccup never blocks a real sign-up.
export async function allowWaitlistSignup(ip: string, max = 20, windowMinutes = 10): Promise<boolean> {
  if (!ip || ip === 'unknown') return true
  try {
    return await allowReleaseLookup(`waitlist:${ip}`, max, windowMinutes)
  } catch {
    return true
  }
}

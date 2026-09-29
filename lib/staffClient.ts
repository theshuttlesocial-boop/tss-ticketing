'use client'
/**
 * Browser side of staff logins. Admin pages call `staffHeaders(secret)` on
 * every request: the signed-in staff member's token, plus the emergency
 * password if one was typed. The token is kept current here (Supabase
 * refreshes it), so the call is synchronous.
 */
import { supabase } from '@/lib/supabase-client'

let token: string | null = null
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null })
  supabase.auth.onAuthStateChange((_e, s) => { token = s?.access_token ?? null })
}

export function staffHeaders(secret?: string | null): Record<string, string> {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(secret ? { 'x-admin-secret': secret } : {}) }
}

/** Same, but waits for the saved sign-in to load (use once, when a page opens). */
export async function staffHeadersReady(secret?: string | null): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  token = data.session?.access_token ?? null
  return staffHeaders(secret)
}

export async function whoAmI(secret?: string | null): Promise<{ email: string | null; role: string; via: string; mfa?: 'ok' | 'needed' } | null> {
  const res = await fetch('/api/staff/me', { cache: 'no-store', headers: await staffHeadersReady(secret) })
  return res.ok ? (await res.json()).staff : null
}

export const signOutStaff = () => supabase.auth.signOut()

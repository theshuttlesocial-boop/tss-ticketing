'use client'
/**
 * Browser side of player accounts: the signed-in user's access token, for
 * `Authorization: Bearer …` on our own API calls. Supabase keeps the session
 * in this browser's storage and refreshes it.
 */
import { supabase } from '@/lib/supabase-client'

export async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch { return {} }
}

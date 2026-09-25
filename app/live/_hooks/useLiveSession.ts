'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { Session } from '@/lib/live-session/engine'

/**
 * Subscribes to the four live_* tables and refetches the whole session on any
 * change. Refetching beats patching local state: the engine derives ratings
 * from all games in order, so a partial update could disagree with the server.
 */
/**
 * `enabled: false` suppresses all fetching — the admin page passes it until it
 * has read the stored secret, so no secret-less request is ever in flight for
 * an admin.
 */
export function useLiveSession(sessionId: string, adminSecret?: string, enabled = true) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only the newest request may write state. Without this, an older response
  // landing last overwrites a newer one — which is how a correct admin secret
  // came to show "that admin secret is not right".
  const latest = useRef(0)

  const refetch = useCallback(async () => {
    if (!enabled) return
    const mine = ++latest.current
    try {
      const res = await fetch(`/api/live/${sessionId}`, {
        cache: 'no-store',
        headers: adminSecret ? { 'x-admin-secret': adminSecret } : undefined,
      })
      const json = await res.json()
      if (mine !== latest.current) return
      if (!res.ok) { setError(json.error ?? 'Could not load session'); return }
      setSession(json.session); setIsAdmin(!!json.admin); setError(null)
    } catch (e) {
      if (mine === latest.current) setError((e as Error).message)
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [sessionId, adminSecret, enabled])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    if (!enabled) return
    // Coalesce bursts: generating a round writes 4 games + 1 round + N players.
    const nudge = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(refetch, 150)
    }
    const channel = supabase.channel(`live:${sessionId}`)
    // live_session_players is deliberately absent: anon cannot read it any more
    // (migration 006). Every rating change is caused by a score write, which
    // touches live_games, so that event still triggers the refetch.
    for (const table of ['live_sessions', 'live_games', 'live_rounds']) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'live_sessions' ? `id=eq.${sessionId}` : `session_id=eq.${sessionId}` },
        nudge)
    }
    channel.subscribe()
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(channel) }
  }, [sessionId, refetch, enabled])

  return { session, error, loading, refetch, isAdmin }
}

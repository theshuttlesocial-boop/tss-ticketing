'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { Session } from '@/lib/live-session/engine'

/**
 * Subscribes to the four live_* tables and refetches the whole session on any
 * change. Refetching beats patching local state: the engine derives ratings
 * from all games in order, so a partial update could disagree with the server.
 */
export function useLiveSession(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${sessionId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Could not load session'); return }
      setSession(json.session); setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    // Coalesce bursts: generating a round writes 4 games + 1 round + N players.
    const nudge = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(refetch, 150)
    }
    const channel = supabase.channel(`live:${sessionId}`)
    for (const table of ['live_sessions', 'live_session_players', 'live_games', 'live_rounds']) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'live_sessions' ? `id=eq.${sessionId}` : `session_id=eq.${sessionId}` },
        nudge)
    }
    channel.subscribe()
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(channel) }
  }, [sessionId, refetch])

  return { session, error, loading, refetch }
}

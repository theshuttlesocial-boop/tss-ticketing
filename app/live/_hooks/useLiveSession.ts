'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { Level, Session } from '@/lib/live-session/engine'
import { clockOffset } from '@/lib/live-session/timer'
import { staffHeaders } from '@/lib/staffClient'

/** Session metadata. Fields after registrationOpen are admin-only. */
export interface LiveMeta {
  name: string
  status: 'setup' | 'live' | 'finished'
  registrationOpen: boolean
  createdAt?: string
  configVersion?: number | null
  latestConfigVersion?: number
  lastScoreAt?: string | null
  lastActivityAt?: string
}

/** Admin-only: a player's level at their most recent earlier session (matched by name). */
export interface PreviousLevel {
  session: string; date: string; level: Level; registered: Level
  moves: { from: Level; to: Level; beforeRound: number; by: string }[]
}

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
  const [meta, setMeta] = useState<LiveMeta | null>(null)
  const [history, setHistory] = useState<Record<string, PreviousLevel>>({})
  /** Server clock minus this device's clock, in ms (see lib/live-session/timer.ts). */
  const [offset, setOffset] = useState(0)
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
    const sentAt = Date.now()
    try {
      const res = await fetch(`/api/live/${sessionId}`, {
        cache: 'no-store',
        // Admin pages pass a secret ('' when signed in with a staff account);
        // public pages pass nothing and send no credentials at all.
        headers: adminSecret !== undefined ? staffHeaders(adminSecret) : undefined,
      })
      const json = await res.json()
      if (mine !== latest.current) return
      if (!res.ok) { setError(json.error ?? 'Could not load session'); return }
      setSession(json.session); setMeta(json.meta ?? null); setIsAdmin(!!json.admin); setError(null)
      setHistory(json.history ?? {})
      if (typeof json.serverNow === 'number') setOffset(clockOffset(json.serverNow, sentAt, Date.now()))
    } catch (e) {
      if (mine === latest.current) setError((e as Error).message)
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [sessionId, adminSecret, enabled])

  useEffect(() => { refetch() }, [refetch])

  // Coming back to the page (phone unlocked, tab switched back): realtime may
  // have missed events while it was asleep, so fetch the truth again.
  useEffect(() => {
    if (!enabled) return
    const onShow = () => { if (document.visibilityState === 'visible') refetch() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [refetch, enabled])

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

  return { session, meta, error, loading, refetch, isAdmin, history, offset }
}

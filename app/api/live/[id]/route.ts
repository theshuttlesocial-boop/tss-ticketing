import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkLive } from '@/lib/live-session/auth'
import {
  loadSession, loadMeta, setRegistrationOpen, finishSession, reopenSession, autoFinishIfStale,
  previousLevels, logEvent, writeCompat, LiveSessionError,
} from '@/lib/live-session/actions'
import { buildConfig, serverKeys, CONFIG_VERSION } from '@/lib/live-session/config'
import { redactSession } from '@/lib/live-session/redact'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Admins get the full session. Everyone else gets a redacted copy: names and
 * court assignments, no ratings, levels, game counts or player totals.
 *
 * Redaction happens here rather than in the UI because the anon key ships in
 * the browser bundle — see migration 006.
 *
 * Loading a session is also when a forgotten one closes itself: still 'live'
 * 6 hours after the last score means it is finished (logged as "system").
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const meta = await autoFinishIfStale(id, await loadMeta(id))
    const session = await loadSession(id)
    if (await checkLive(req, id)) {
      const history = await previousLevels(id).catch(() => ({}))
      return NextResponse.json({ session, meta, admin: true, history, serverNow: Date.now() })
    }
    const { lastScoreAt: _s, lastActivityAt: _a, configVersion: _v, latestConfigVersion: _l, ...pub } = meta
    return NextResponse.json({ session: redactSession(session), meta: pub, admin: false, serverNow: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await checkLive(req, (await params).id))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message },
    { status: e instanceof LiveSessionError ? 400 : 500 })

  try {
    if (typeof body.registrationOpen === 'boolean') await setRegistrationOpen(id, body.registrationOpen)

    const { data: cur, error: cErr } = await supabaseAdmin.from('live_sessions').select('config,status').eq('id', id).single()
    if (cErr || !cur) return NextResponse.json({ error: 'session not found' }, { status: 404 })

    if (body.status !== undefined) {
      if (!['setup', 'live', 'finished'].includes(body.status))
        return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      if (body.status === 'finished') await finishSession(id)
      else if (body.status === 'live' && cur.status === 'finished') await reopenSession(id)
      else if (body.status !== cur.status) {
        const { error } = await supabaseAdmin.from('live_sessions').update({ status: body.status }).eq('id', id)
        if (error) throw error
      }
    }

    const update: Record<string, any> = {}
    if (body.name !== undefined) update.name = body.name
    if (body.seed !== undefined) update.seed = body.seed

    // Settings are rebuilt from DEFAULT_CONFIG + the allowed overrides; a
    // browser can never store a whole config object, stale or otherwise.
    // Server-owned keys (registration, leavers, final, level-review state) are
    // carried over from the stored row.
    if (body.useLatest === true) {
      if (cur.status !== 'setup')
        return NextResponse.json({ error: 'Only a session that has not started can switch settings' }, { status: 409 })
      const courts = (cur.config as any)?.rotation?.courts
      update.config = { ...buildConfig(courts ? { courts } : {}), ...serverKeys(cur.config) }
      update.config_version = CONFIG_VERSION
    } else if (body.config !== undefined) {
      update.config = { ...buildConfig(body.config), ...serverKeys(cur.config) }
      update.config_version = CONFIG_VERSION
    }

    if (Object.keys(update).length) {
      const { error } = await writeCompat((row) => supabaseAdmin.from('live_sessions').update(row).eq('id', id), update)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (update.config) await logEvent({ session_id: id, event: 'config', detail: { latest: body.useLatest === true } })
    } else if (body.status === undefined && typeof body.registrationOpen !== 'boolean') {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}

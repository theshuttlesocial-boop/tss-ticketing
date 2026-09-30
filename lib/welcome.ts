import { supabaseAdmin } from '@/lib/supabase'

/**
 * Phase 8 welcome offer and WhatsApp join settings (Admin → Settings, site_settings).
 * Defaults: on, code WELCOME, £2 off someone's first booking.
 */
export type WelcomeSettings = { enabled: boolean; code: string; discountPence: number; inviteUrl: string }

export async function getWelcomeSettings(): Promise<WelcomeSettings> {
  const { data } = await supabaseAdmin.from('site_settings').select('key,value')
    .in('key', ['welcome_enabled', 'welcome_code', 'welcome_discount_pence', 'whatsapp_invite_url'])
  const s: Record<string, string> = {}
  ;(data ?? []).forEach((r) => { s[r.key] = r.value })
  const pence = parseInt(s.welcome_discount_pence ?? '200', 10)
  return {
    enabled: (s.welcome_enabled ?? 'on') !== 'off',
    code: (s.welcome_code ?? 'WELCOME').trim().toUpperCase() || 'WELCOME',
    discountPence: Number.isFinite(pence) && pence > 0 ? pence : 0,
    inviteUrl: (s.whatsapp_invite_url ?? '').trim(),
  }
}

/** The code, cleaned the way a person might type it ("welcome ", "Welcome"). */
export const normaliseCode = (c: unknown) => String(c ?? '').trim().toUpperCase().slice(0, 40)

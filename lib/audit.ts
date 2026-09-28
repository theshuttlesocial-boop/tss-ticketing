import { supabaseAdmin } from '@/lib/supabase'

// Fire-and-forget audit trail. Never let logging break the main flow.
export async function logAudit(event: string, detail: Record<string, any> = {}, entity?: string): Promise<void> {
  try {
    await supabaseAdmin.from('audit_log').insert({ event, entity: entity ?? null, detail })
  } catch (e) {
    console.error('[audit] failed to log', event, e)
  }
}

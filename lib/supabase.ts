/**
 * SERVER-ONLY Supabase client.
 *
 * This module reads SUPABASE_SERVICE_ROLE_KEY, which bypasses row-level
 * security entirely. It must never reach the browser bundle. Client components
 * import `@/lib/supabase-client` instead.
 *
 * The anon client used to live here too, which made this module a trap: a
 * client component importing it pulled in the service-role construction and
 * crashed with "supabaseKey is required", because the key is undefined in the
 * browser. Splitting the two removes the trap.
 */
import { createClient } from '@supabase/supabase-js'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase.ts is server-only — it reads SUPABASE_SERVICE_ROLE_KEY. ' +
    'Import @/lib/supabase-client from client components.'
  )
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
})

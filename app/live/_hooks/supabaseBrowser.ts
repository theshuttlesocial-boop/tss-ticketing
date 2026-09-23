import { createClient } from '@supabase/supabase-js'

/**
 * Browser-only Supabase client.
 *
 * Deliberately NOT imported from @/lib/supabase: that module also constructs
 * supabaseAdmin from SUPABASE_SERVICE_ROLE_KEY, which is undefined in the
 * browser, so importing it from a client component throws
 * "supabaseKey is required" at runtime. Only the public vars belong here.
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

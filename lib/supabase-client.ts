/**
 * Browser-safe Supabase client, anon key only.
 *
 * Safe to import from client components. Reads only NEXT_PUBLIC_* variables,
 * so it carries no privileged credentials and is subject to row-level security
 * like any other public caller.
 */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

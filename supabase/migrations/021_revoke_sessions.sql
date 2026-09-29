-- ============================================================
-- Migration 021: sign someone out everywhere (Roadmap Phase 5d)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- Used when an owner resets a staff member's two-step login (lost or stolen
-- phone): every sign-in session that person has is ended at once. The server
-- checks each request with Supabase, which rejects an ended session, so they
-- are locked out on their very next click and must sign in again from
-- scratch. Service role only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = auth, public AS $$
  WITH ended AS (DELETE FROM auth.sessions WHERE user_id = p_user RETURNING 1)
  SELECT count(*)::int FROM ended
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;

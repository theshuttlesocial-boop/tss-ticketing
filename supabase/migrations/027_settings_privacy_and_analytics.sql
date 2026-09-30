-- ============================================================
-- Migration 027: audit fixes (30 September 2026)
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- 1. site_settings: the public (anon) key could read every setting, including the
--    WhatsApp invite link that /join hands out only after the form. Now the public
--    can read only the About text and the Terms (what the booking page shows);
--    everything else is server-only. Writes were already blocked.
--
-- 2. session_analytics: the tickets page counts session views and "Book now" clicks
--    (no personal data), and Admin → Analytics reads them, but the table was never
--    created, so both silently failed. Service role only.
-- ============================================================

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'site_settings' AND cmd IN ('SELECT', 'ALL') LOOP
    EXECUTE format('DROP POLICY %I ON public.site_settings', p.policyname);
  END LOOP;
END $$;

CREATE POLICY site_settings_public_read ON site_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('about_text', 'terms_and_conditions'));

CREATE TABLE IF NOT EXISTS session_analytics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('session_view', 'book_now_click')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_analytics_session ON session_analytics (session_id);
ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;

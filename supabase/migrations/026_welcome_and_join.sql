-- ============================================================
-- Migration 026: Phase 8 welcome offer + WhatsApp join page
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- welcome_redemptions + claim_welcome(): the welcome discount (Admin → Settings)
--   is for someone's first booking only, once per email. When a booking uses it,
--   claim_welcome() sets it aside under a lock on that email (status 'held' for
--   60 minutes); payment marks it 'redeemed'. A held claim that never pays lapses,
--   so the person can try again. Redemptions are listed in Admin → Settings.
--
-- join_requests: the /join page (before the WhatsApp community invite link):
--   first name, email, how they heard about us. Deleted after 12 months.
--
-- Both tables: service role only (RLS on, no policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS welcome_redemptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  booking_ref   TEXT NOT NULL,
  amount_pence  INTEGER NOT NULL,
  code          TEXT,
  src           TEXT,
  status        TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'redeemed')),
  held_until    TIMESTAMPTZ NOT NULL,
  redeemed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_welcome_email ON welcome_redemptions (lower(email));
CREATE INDEX IF NOT EXISTS idx_welcome_ref ON welcome_redemptions (booking_ref);
ALTER TABLE welcome_redemptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS join_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  TEXT NOT NULL,
  email       TEXT NOT NULL,
  heard_from  TEXT,
  src         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_join_requests_created ON join_requests (created_at DESC);
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;

-- Returns true when this email may use the welcome discount on this booking, and holds it.
-- Not allowed: an earlier paid booking for the email, or a redeemed / still-held claim.
CREATE OR REPLACE FUNCTION public.claim_welcome(p_email TEXT, p_booking_ref TEXT, p_amount INTEGER, p_code TEXT, p_src TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  r welcome_redemptions%ROWTYPE;
BEGIN
  IF v_email = '' OR p_amount <= 0 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('welcome:' || v_email));
  IF EXISTS (SELECT 1 FROM bookings WHERE lower(email) = v_email
               AND stripe_status IN ('succeeded', 'partially_refunded', 'refunded')) THEN
    RETURN false;
  END IF;
  SELECT * INTO r FROM welcome_redemptions WHERE lower(email) = v_email;
  IF FOUND THEN
    IF r.status = 'redeemed' OR r.held_until > now() THEN RETURN false; END IF;
    UPDATE welcome_redemptions
       SET booking_ref = p_booking_ref, amount_pence = p_amount, code = p_code, src = p_src,
           status = 'held', held_until = now() + INTERVAL '60 minutes', created_at = now()
     WHERE id = r.id;
  ELSE
    INSERT INTO welcome_redemptions (email, booking_ref, amount_pence, code, src, held_until)
    VALUES (v_email, p_booking_ref, p_amount, p_code, p_src, now() + INTERVAL '60 minutes');
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_welcome(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_welcome(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- Daily clean-up: join requests after 12 months; lapsed welcome holds after a day;
-- redemptions after 6 years (with the booking records).
CREATE OR REPLACE FUNCTION public.clean_welcome_and_join()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM join_requests WHERE created_at < now() - INTERVAL '12 months';
  DELETE FROM welcome_redemptions WHERE status = 'held' AND held_until < now() - INTERVAL '1 day';
  DELETE FROM welcome_redemptions WHERE created_at < now() - INTERVAL '6 years';
END $$;
REVOKE ALL ON FUNCTION public.clean_welcome_and_join() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_welcome_and_join() TO service_role;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('tss-welcome-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('tss-welcome-cleanup', '50 3 * * *', 'SELECT public.clean_welcome_and_join()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). Enable it in Database → Extensions, then run this file again.', SQLERRM;
END $$;

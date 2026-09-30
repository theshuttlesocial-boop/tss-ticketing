-- ============================================================
-- Migration 025: website form inbox + credit holds
-- Run in Supabase SQL Editor. Safe to run more than once.
--
-- form_messages: Join us applications and suggestions from theshuttlesocial.com,
--   kept so the team can mark them reviewed in Admin → Inbox (they're emailed too).
--   Deleted automatically after 12 months (privacy notice).
--
-- credit_holds + hold_credit(): stops the same credit being spent twice when one
--   email books twice at the same moment. Before a payment starts, the credit it
--   uses is set aside under a lock on that email; a second booking only sees what
--   is left. The hold is removed when the payment completes, or expires after
--   60 minutes if it never does.
--
-- Both tables: service role only (RLS on, no policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS form_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('join', 'suggestion')),
  name        TEXT,
  email       TEXT,
  fields      JSONB NOT NULL DEFAULT '[]'::jsonb,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_messages_created ON form_messages (created_at DESC);
ALTER TABLE form_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS credit_holds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  booking_ref  TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_holds_email ON credit_holds (lower(email), expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_holds_ref ON credit_holds (booking_ref);
ALTER TABLE credit_holds ENABLE ROW LEVEL SECURITY;

-- Sets aside up to p_want pence of this email's credit for one booking; returns how much.
CREATE OR REPLACE FUNCTION public.hold_credit(p_email TEXT, p_want INTEGER, p_booking_ref TEXT, p_minutes INTEGER DEFAULT 60)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_free  INTEGER;
  v_grant INTEGER;
BEGIN
  IF v_email = '' OR p_want <= 0 THEN RETURN 0; END IF;
  -- One booking at a time per email: the second waits here until the first has its hold.
  PERFORM pg_advisory_xact_lock(hashtext('credit:' || v_email));
  SELECT COALESCE((SELECT sum(amount_pence) FROM credits
                    WHERE lower(email) = v_email AND used_at IS NULL AND expires_at > now()), 0)
       - COALESCE((SELECT sum(amount_pence) FROM credit_holds
                    WHERE lower(email) = v_email AND expires_at > now()), 0)
    INTO v_free;
  v_grant := GREATEST(0, LEAST(v_free, p_want));
  IF v_grant > 0 THEN
    INSERT INTO credit_holds (email, amount_pence, booking_ref, expires_at)
    VALUES (v_email, v_grant, p_booking_ref, now() + make_interval(mins => p_minutes));
  END IF;
  RETURN v_grant;
END $$;

REVOKE ALL ON FUNCTION public.hold_credit(TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_credit(TEXT, INTEGER, TEXT, INTEGER) TO service_role;

-- Daily clean-up: messages older than 12 months, credit holds that expired over a day ago.
CREATE OR REPLACE FUNCTION public.clean_inbox_and_holds()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM form_messages WHERE created_at < now() - INTERVAL '12 months';
  DELETE FROM credit_holds  WHERE expires_at < now() - INTERVAL '1 day';
END $$;
REVOKE ALL ON FUNCTION public.clean_inbox_and_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clean_inbox_and_holds() TO service_role;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('tss-inbox-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('tss-inbox-cleanup', '40 3 * * *', 'SELECT public.clean_inbox_and_holds()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). Enable it in Database → Extensions, then run this file again.', SQLERRM;
END $$;

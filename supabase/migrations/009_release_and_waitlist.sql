-- ============================================================
-- TSS TICKETING — SELF-SERVICE SPOT RELEASE + TIERED WAITLIST
-- Phase 1: schema
-- Safe to run twice (idempotent).
--
-- NOTE: the `waitlist`, `bookings` and `sessions` tables already
-- exist in the live database. This migration only extends them and
-- adds new tables/functions, so it never re-creates them.
-- ============================================================

-- ── waitlist: matching + live-offer columns ─────────────────────────────────
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS spaces_needed INTEGER NOT NULL DEFAULT 1
  CHECK (spaces_needed BETWEEN 1 AND 4);
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS min_spaces_acceptable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS waitlist_group_id UUID;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preference_rank INTEGER NOT NULL DEFAULT 1;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'waiting'
  CHECK (status IN ('waiting','offered','claimed','expired','declined','withdrawn'));
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS claim_token TEXT UNIQUE;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS claim_spaces INTEGER;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS times_offered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS last_offered_at TIMESTAMPTZ;

-- Cross-column check: a column-level CHECK cannot reference another column,
-- and Postgres has no ADD CONSTRAINT IF NOT EXISTS — guard on pg_constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_min_spaces_chk') THEN
    ALTER TABLE waitlist ADD CONSTRAINT waitlist_min_spaces_chk
      CHECK (min_spaces_acceptable BETWEEN 1 AND spaces_needed);
  END IF;
END $$;

-- Fast lookup of a person's rows across sessions, and of live offers to expire.
CREATE INDEX IF NOT EXISTS idx_waitlist_group  ON waitlist (waitlist_group_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist (session_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_offered ON waitlist (status, claim_expires_at)
  WHERE status = 'offered';

-- ── bookings: release / transfer columns ────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS spaces_released INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS release_status TEXT NOT NULL DEFAULT 'none'
  CHECK (release_status IN ('none','pending_replacement','replaced','expired_unfilled','transferred'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_preference TEXT
  CHECK (refund_preference IS NULL OR refund_preference IN ('credit','card','name_change'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transferred_from_booking_id UUID REFERENCES bookings(id);

-- ── releases: one row per self-service release of spaces ────────────────────
CREATE TABLE IF NOT EXISTS releases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id             UUID NOT NULL REFERENCES bookings(id),
  session_id             UUID NOT NULL REFERENCES sessions(id),
  spaces                 INTEGER NOT NULL,
  refund_preference      TEXT NOT NULL,               -- credit | card
  released_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ,
  outcome                TEXT,                         -- replaced | unfilled | cancelled_by_user
  replacement_booking_id UUID REFERENCES bookings(id),
  admin_fee_pence        INTEGER NOT NULL DEFAULT 0
);
-- The cron cascade scans for unresolved releases per session.
CREATE INDEX IF NOT EXISTS idx_releases_unresolved ON releases (session_id)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_releases_booking ON releases (booking_id);

-- ── credits: full-face-value store credit, 90-day expiry ────────────────────
CREATE TABLE IF NOT EXISTS credits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  phone             TEXT,
  amount_pence      INTEGER NOT NULL,
  source_booking_id UUID REFERENCES bookings(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  used_at           TIMESTAMPTZ,
  used_booking_id   UUID REFERENCES bookings(id)
);
CREATE INDEX IF NOT EXISTS credits_email_unused_idx ON credits (lower(email))
  WHERE used_at IS NULL;

-- ── ticket_transfers: free name changes, confirmed by the incoming person ───
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings(id),
  from_name     TEXT NOT NULL,
  from_email    TEXT NOT NULL,
  to_name       TEXT NOT NULL,
  to_email      TEXT NOT NULL,
  to_phone      TEXT,
  spaces        INTEGER NOT NULL DEFAULT 1,
  confirm_token TEXT UNIQUE NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_transfers_booking ON ticket_transfers (booking_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- How many prior sessions this email has attended (paid + past-dated).
-- "New player" == 0.
CREATE OR REPLACE FUNCTION prior_session_count(p_email TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT b.session_id)::INTEGER
  FROM bookings b
  JOIN sessions s ON s.id = b.session_id
  WHERE b.stripe_status = 'succeeded'
    AND s.date < CURRENT_DATE
    AND lower(b.email) = lower(p_email);
$$;

-- How many CARD refunds this email has actually received in the last 90 days.
-- Only fulfilled card releases count: refund_preference='card' AND outcome='replaced'.
-- Credit and name-change routes are structurally excluded by those filters.
CREATE OR REPLACE FUNCTION cash_refunds_last_90_days(p_email TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM releases r
  JOIN bookings b ON b.id = r.booking_id
  WHERE r.refund_preference = 'card'
    AND r.outcome = 'replaced'
    AND r.released_at > now() - interval '90 days'
    AND lower(b.email) = lower(p_email);
$$;

-- ============================================================
-- RLS: service role only (no public policies) on the new tables
-- ============================================================
ALTER TABLE releases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only the service role (supabaseAdmin) can read/write.

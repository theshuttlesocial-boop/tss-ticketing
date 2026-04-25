-- ============================================================
-- TSS TICKETING — SUPABASE SCHEMA
-- Run this in your Supabase SQL editor to set up the database
-- ============================================================

-- Sessions table: each badminton session you create
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,                        -- e.g. "TSS Session #42"
  venue        TEXT NOT NULL,                        -- e.g. "Harrow High School"
  region       TEXT NOT NULL,                        -- e.g. "North/West London"
  date         DATE NOT NULL,
  time         TEXT NOT NULL,                        -- e.g. "19:00"
  capacity     INTEGER NOT NULL DEFAULT 24,
  price_pence  INTEGER NOT NULL DEFAULT 800,         -- £8.00 stored as pence
  status       TEXT NOT NULL DEFAULT 'draft'         -- draft | open | closed | cancelled
                CHECK (status IN ('draft','open','closed','cancelled')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Bookings table: confirmed paid bookings
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 4),
  total_pence     INTEGER NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_status   TEXT DEFAULT 'pending',            -- pending | succeeded | failed | refunded
  booking_ref     TEXT UNIQUE NOT NULL,              -- e.g. "TSS-A3F7K"
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seat holds: temporary locks (2 min) to prevent double-booking
-- This is the core race-condition fix
CREATE TABLE seat_holds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id),
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 4),
  hold_token   TEXT UNIQUE NOT NULL,                 -- given to the user's browser
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 minutes'),
  used         BOOLEAN DEFAULT false,                -- true once payment confirmed
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for fast availability checks
CREATE INDEX idx_bookings_session ON bookings(session_id) WHERE stripe_status = 'succeeded';
CREATE INDEX idx_holds_session    ON seat_holds(session_id) WHERE used = false AND expires_at > now();
CREATE INDEX idx_holds_token      ON seat_holds(hold_token);

-- ============================================================
-- ATOMIC AVAILABILITY CHECK FUNCTION
-- This runs as a single database transaction so two simultaneous
-- requests can never both succeed for the last remaining seat.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_seat_hold(
  p_session_id  UUID,
  p_quantity    INTEGER,
  p_hold_token  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity    INTEGER;
  v_booked      INTEGER;
  v_held        INTEGER;
  v_available   INTEGER;
BEGIN
  -- Lock the session row so no concurrent call can read stale data
  SELECT capacity INTO v_capacity
  FROM sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session not available');
  END IF;

  -- Count confirmed bookings
  SELECT COALESCE(SUM(quantity), 0) INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND stripe_status = 'succeeded';

  -- Count active (unexpired, unused) holds
  SELECT COALESCE(SUM(quantity), 0) INTO v_held
  FROM seat_holds
  WHERE session_id = p_session_id
    AND used = false
    AND expires_at > now();

  v_available := v_capacity - v_booked - v_held;

  IF v_available < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not enough spots available',
      'available', v_available
    );
  END IF;

  -- Insert the hold atomically
  INSERT INTO seat_holds (session_id, quantity, hold_token)
  VALUES (p_session_id, p_quantity, p_hold_token);

  RETURN json_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'expires_at', (now() + INTERVAL '2 minutes')::TEXT,
    'available_after_hold', v_available - p_quantity
  );
END;
$$;

-- ============================================================
-- HELPER: clean up expired holds automatically
-- Run this as a Supabase scheduled job (pg_cron) every minute:
--   SELECT cron.schedule('cleanup-holds', '* * * * *', 'SELECT cleanup_expired_holds()');
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM seat_holds WHERE expires_at < now() AND used = false;
$$;

-- ============================================================
-- SEED DATA: your first 3 upcoming sessions
-- ============================================================
INSERT INTO sessions (title, venue, region, date, time, capacity, price_pence, status) VALUES
  ('TSS Session #42', 'Harrow High School',        'North/West London', '2026-04-24', '19:00', 24, 800, 'open'),
  ('TSS Session #43', 'Frances Bardsley Academy',   'East London',       '2026-04-25', '18:30', 24, 800, 'open'),
  ('TSS Session #44', 'Harrow High School',        'North/West London', '2026-05-01', '19:00', 24, 800, 'draft');

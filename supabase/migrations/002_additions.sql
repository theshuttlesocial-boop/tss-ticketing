-- ============================================================
-- TSS TICKETING — ADDITIONS
-- Run this in your Supabase SQL editor after 001_initial_schema.sql
-- ============================================================

-- Group 4: reduce seat hold timer to 1 minute (matches claim_seat_hold function update)
-- Note: 001_initial_schema.sql already updated to INTERVAL '1 minute'
-- If upgrading an existing DB, run this:
ALTER TABLE seat_holds ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '1 minute');

-- Also update the claim_seat_hold function to return 1 min expiry
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
  SELECT capacity INTO v_capacity
  FROM sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session not available');
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND stripe_status = 'succeeded';

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

  INSERT INTO seat_holds (session_id, quantity, hold_token)
  VALUES (p_session_id, p_quantity, p_hold_token);

  RETURN json_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'expires_at', (now() + INTERVAL '1 minute')::TEXT,
    'available_after_hold', v_available - p_quantity
  );
END;
$$;

-- Group 5: max tickets per order
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_tickets_per_order INTEGER DEFAULT 4;

-- Group 9: Google Maps URL override
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS maps_url TEXT;

-- Group 10: session analytics (click tracking)
CREATE TABLE IF NOT EXISTS session_analytics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event      TEXT NOT NULL DEFAULT 'book_now_click',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_session ON session_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event   ON session_analytics(event);

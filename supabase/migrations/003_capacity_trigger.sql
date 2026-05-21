-- ============================================================
-- Migration 003: Hard capacity backstop + extended hold duration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. CAPACITY ENFORCEMENT TRIGGER
--    Fires before any INSERT/UPDATE that sets stripe_status='succeeded'.
--    Raises an exception if confirming this booking would exceed session capacity.
--    This is the final line of defence against overselling even under race conditions.

CREATE OR REPLACE FUNCTION check_capacity_not_exceeded()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_capacity INTEGER;
  v_booked   INTEGER;
BEGIN
  SELECT capacity INTO v_capacity FROM sessions WHERE id = NEW.session_id;

  -- Count all *other* succeeded bookings for this session (exclude the current row
  -- so an UPDATE from pending→succeeded doesn't double-count itself)
  SELECT COALESCE(SUM(quantity), 0) INTO v_booked
  FROM bookings
  WHERE session_id = NEW.session_id
    AND stripe_status = 'succeeded'
    AND id != NEW.id;

  IF v_booked + NEW.quantity > v_capacity THEN
    RAISE EXCEPTION 'capacity_exceeded: session % is full (booked=%, new=%, capacity=%)',
      NEW.session_id, v_booked, NEW.quantity, v_capacity;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if it already exists from a previous attempt, then recreate
DROP TRIGGER IF EXISTS enforce_capacity ON bookings;

CREATE TRIGGER enforce_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.stripe_status = 'succeeded')
  EXECUTE FUNCTION check_capacity_not_exceeded();


-- 2. EXTEND SEAT HOLD DURATION: 1 minute → 10 minutes
--    1 minute was too short for Apple Pay / bank 3DS flows which can take 2-5 min.
--    Update the claim_seat_hold function to use 10-minute holds.

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
  v_expires_at  TIMESTAMPTZ;
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

  -- 10-minute hold (was 1 min — too short for Apple Pay / 3DS)
  v_expires_at := now() + INTERVAL '10 minutes';

  INSERT INTO seat_holds (session_id, quantity, hold_token, expires_at)
  VALUES (p_session_id, p_quantity, p_hold_token, v_expires_at);

  RETURN json_build_object(
    'success', true,
    'hold_token', p_hold_token,
    'expires_at', v_expires_at::TEXT,
    'available_after_hold', v_available - p_quantity
  );
END;
$$;

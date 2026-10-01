-- ============================================================
-- Migration 028: released spaces go to the waitlist first
-- Run in Supabase SQL Editor AFTER the code for it is live (PR "Release flow v2").
-- Safe to run more than once.
--
-- claim_seat_hold() gains p_for_waitlist:
--   - Public bookings (p_for_waitlist = false, the default) can no longer take spaces
--     promised to someone holding a live waitlist offer. While an offer is live, the
--     session stays full on the tickets page; if it lapses or is declined, the space
--     goes to the next person, and only once nobody is waiting does it go on sale.
--   - Waitlist claims (p_for_waitlist = true) can use those spaces.
-- Execute is limited to the service role (the app's server).
-- ============================================================

DROP FUNCTION IF EXISTS claim_seat_hold(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION claim_seat_hold(
  p_session_id    UUID,
  p_quantity      INTEGER,
  p_hold_token    TEXT,
  p_for_waitlist  BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity    INTEGER;
  v_booked      INTEGER;
  v_held        INTEGER;
  v_offered     INTEGER := 0;
  v_available   INTEGER;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  -- Open, or a scheduled-release draft whose opens_at has passed.
  SELECT capacity INTO v_capacity
  FROM sessions
  WHERE id = p_session_id
    AND (
      status = 'open'
      OR (status = 'draft' AND opens_at IS NOT NULL AND opens_at <= now())
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session not available');
  END IF;

  SELECT COALESCE(SUM(quantity - COALESCE(spaces_released, 0)), 0) INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND stripe_status IN ('succeeded','partially_refunded');

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
  FROM seat_holds
  WHERE session_id = p_session_id AND used = false AND expires_at > now();

  -- Spaces promised to live waitlist offers are off public sale.
  IF NOT p_for_waitlist THEN
    SELECT COALESCE(SUM(claim_spaces), 0) INTO v_offered
    FROM waitlist
    WHERE session_id = p_session_id AND status = 'offered' AND claim_expires_at > now();
  END IF;

  v_available := v_capacity - v_booked - v_held - v_offered;

  IF v_available < p_quantity THEN
    RETURN json_build_object('success', false, 'error', 'Not enough spots available', 'available', GREATEST(v_available, 0));
  END IF;

  v_expires_at := now() + INTERVAL '10 minutes';
  INSERT INTO seat_holds (session_id, quantity, hold_token, expires_at)
  VALUES (p_session_id, p_quantity, p_hold_token, v_expires_at);

  RETURN json_build_object('success', true, 'hold_token', p_hold_token,
    'expires_at', v_expires_at::TEXT, 'available_after_hold', v_available - p_quantity);
END;
$$;

REVOKE ALL ON FUNCTION claim_seat_hold(UUID, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_seat_hold(UUID, INTEGER, TEXT, BOOLEAN) TO service_role;

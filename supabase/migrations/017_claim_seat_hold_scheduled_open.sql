-- ============================================================
-- TSS TICKETING — fix: booking a scheduled-release session
--
-- Sessions created with a scheduled drop have status='draft' + opens_at. Once
-- opens_at passes, the public page shows them as bookable (it computes an
-- "effective open" status), but claim_seat_hold only accepted literal
-- status='open' — so booking such a session failed with "Session not available".
--
-- This makes the atomic booking gate accept a session that is EITHER open, or a
-- draft whose opens_at has already passed. Closed/cancelled stay unbookable.
--
-- Preserves the 015 counting logic (succeeded + partially_refunded, net of
-- released spaces). Safe to run twice.
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

  v_available := v_capacity - v_booked - v_held;

  IF v_available < p_quantity THEN
    RETURN json_build_object('success', false, 'error', 'Not enough spots available', 'available', v_available);
  END IF;

  v_expires_at := now() + INTERVAL '10 minutes';
  INSERT INTO seat_holds (session_id, quantity, hold_token, expires_at)
  VALUES (p_session_id, p_quantity, p_hold_token, v_expires_at);

  RETURN json_build_object('success', true, 'hold_token', p_hold_token,
    'expires_at', v_expires_at::TEXT, 'available_after_hold', v_available - p_quantity);
END;
$$;

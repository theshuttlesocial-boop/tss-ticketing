/**
 * PIN storage, sign-in and rate limiting. Server only (service role).
 */
import { supabaseAdmin } from '@/lib/supabase';
import { generatePin, hashPin, nameKey, PIN_TRIES, PIN_WINDOW_MIN, verifyPin, validPin } from './pin';

/** Give a player a fresh PIN; returns it (the only time it exists in clear). */
export async function issuePin(playerId: string): Promise<string | null> {
  const pin = generatePin();
  const { error } = await supabaseAdmin.from('live_session_players').update({ pin_hash: hashPin(pin) }).eq('id', playerId);
  if (error) { console.error('[pin]', error.message); return null; } // migration 013 not run: no PIN, registration still works
  return pin;
}

export type SignIn =
  | { ok: true; playerId: string }
  | { ok: false; status: number; error: string };

/** "Already registered?": name + PIN, at most 5 wrong tries per name per 10 minutes. */
export async function signInWithPin(sessionId: string, name: string, pin: string): Promise<SignIn> {
  const key = nameKey(String(name ?? ''));
  if (key.length < 2) return { ok: false, status: 400, error: 'Enter your name as you registered it' };
  if (!validPin(pin)) return { ok: false, status: 400, error: 'Your PIN is 4 digits' };

  const since = new Date(Date.now() - PIN_WINDOW_MIN * 60_000).toISOString();
  const { count, error: cErr } = await supabaseAdmin.from('live_pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId).eq('name_key', key).gte('created_at', since);
  if (cErr) return { ok: false, status: 503, error: 'Sign-in with a PIN is not switched on yet — ask the organiser for your link' };
  if ((count ?? 0) >= PIN_TRIES)
    return { ok: false, status: 429, error: `Too many tries. Wait ${PIN_WINDOW_MIN} minutes, or ask the organiser for your link.` };

  const { data: players } = await supabaseAdmin.from('live_session_players')
    .select('id,name,pin_hash').eq('session_id', sessionId);
  const me = (players ?? []).find((p) => nameKey(p.name) === key);
  if (me && verifyPin(pin, me.pin_hash)) return { ok: true, playerId: me.id };

  // Same answer whether the name is unknown, has no PIN or the PIN is wrong,
  // so this can't be used to find out who is registered.
  await supabaseAdmin.from('live_pin_attempts').insert({ session_id: sessionId, name_key: key });
  await supabaseAdmin.from('live_pin_attempts').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  const left = PIN_TRIES - (count ?? 0) - 1;
  return { ok: false, status: 401, error: left > 0
    ? `That name and PIN don't match (${left} ${left === 1 ? 'try' : 'tries'} left). If the organiser added you, ask them for a PIN.`
    : `That name and PIN don't match. Wait ${PIN_WINDOW_MIN} minutes, or ask the organiser for your link.` };
}

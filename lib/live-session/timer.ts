/**
 * Round timer stored on the server (live_rounds, migration 012), so it
 * survives reloads, leaving the page and switching phones. Pure: every view
 * computes the time left from these fields plus its own estimate of the
 * server clock, and the server applies actions with its own clock.
 *
 * Representation:
 *   idle     startedAt = null
 *   running  startedAt = when it last (re)started, remainingS = seconds left
 *            at that moment, pausedAt = null
 *   paused   pausedAt set, remainingS = seconds left when paused
 * durationS is the length it was started with (for display and reset).
 */
import type { TimerState } from './engine/types';
export type { TimerState };

export type TimerAction =
  | { action: 'start'; seconds: number }
  | { action: 'pause' } | { action: 'resume' } | { action: 'reset' }
  | { action: 'add'; seconds: number };

export const IDLE: TimerState = { startedAt: null, durationS: null, pausedAt: null, remainingS: null };

export const timerStatus = (t: TimerState | null | undefined): 'idle' | 'running' | 'paused' =>
  !t?.startedAt ? 'idle' : t.pausedAt ? 'paused' : 'running';

/** Seconds left at server time `now` (ms). Null when idle. Never negative. */
export function remaining(t: TimerState | null | undefined, now: number): number | null {
  const st = timerStatus(t);
  if (st === 'idle') return null;
  const base = t!.remainingS ?? t!.durationS ?? 0;
  if (st === 'paused') return Math.max(0, base);
  return Math.max(0, base - (now - Date.parse(t!.startedAt!)) / 1000);
}

/** Apply an admin action at server time `now` (ms). Throws on nonsense. */
export function applyTimer(t: TimerState | null | undefined, a: TimerAction, now: number): TimerState {
  const cur = t ?? IDLE;
  const iso = new Date(now).toISOString();
  const st = timerStatus(cur);
  switch (a.action) {
    case 'start': {
      if (!Number.isInteger(a.seconds) || a.seconds < 30 || a.seconds > 60 * 60) throw new Error('timer length must be 30 s – 60 min');
      return { startedAt: iso, durationS: a.seconds, pausedAt: null, remainingS: a.seconds };
    }
    case 'pause':
      if (st !== 'running') return cur;
      return { ...cur, pausedAt: iso, remainingS: Math.round(remaining(cur, now)!) };
    case 'resume':
      if (st !== 'paused') return cur;
      return { ...cur, startedAt: iso, pausedAt: null };
    case 'reset':
      return IDLE;
    case 'add': {
      if (!Number.isInteger(a.seconds) || a.seconds < -600 || a.seconds > 600) throw new Error('can add up to 10 minutes');
      if (st === 'idle') return cur;
      const left = Math.max(0, Math.round(remaining(cur, now)!) + a.seconds);
      return st === 'paused'
        ? { ...cur, remainingS: left }
        : { ...cur, startedAt: iso, remainingS: left };
    }
  }
}

/**
 * Estimate (server clock − this device's clock) from one request: the server
 * stamped `serverNow` somewhere between `sentAt` and `receivedAt`, so assume
 * the midpoint. Phones' clocks are often seconds out; this keeps every screen
 * showing the same time.
 */
export const clockOffset = (serverNow: number, sentAt: number, receivedAt: number) =>
  serverNow - (sentAt + receivedAt) / 2;

export const fmt = (s: number | null) => {
  if (s == null) return '--:--';
  const whole = Math.ceil(s);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** Row <-> state. Columns may be missing before migration 012 has run. */
export const rowToTimer = (r: any): TimerState | undefined =>
  r && 'timer_started_at' in r
    ? { startedAt: r.timer_started_at ?? null, durationS: r.timer_duration_s ?? null,
        pausedAt: r.timer_paused_at ?? null, remainingS: r.timer_remaining_s ?? null }
    : undefined;

export const timerToRow = (t: TimerState) => ({
  timer_started_at: t.startedAt, timer_duration_s: t.durationS,
  timer_paused_at: t.pausedAt, timer_remaining_s: t.remainingS,
});

/** "Also start iPhone timer": the TSS Round shortcut, given the minutes as text. */
export const shortcutUrl = (seconds: number) =>
  `shortcuts://run-shortcut?name=${encodeURIComponent('TSS Round')}&input=text&text=${Math.max(1, Math.round(seconds / 60))}`;

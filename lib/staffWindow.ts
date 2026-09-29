/**
 * When a session lead may act for a booking session: from 3 hours before it
 * starts until 6 hours after (covers setting up, the night, and finishing
 * late). Session dates and times are UK local; this handles BST/GMT.
 */
export const LEAD_BEFORE_H = 3;
export const LEAD_AFTER_H = 6;

/** A UK wall-clock date + time ("2026-10-02", "19:00") as a UTC instant. */
export function londonToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // What does London's clock read at `guess`? The difference is the offset.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (shown - guess));
}

export function defaultLeadWindow(date: string, time: string) {
  const start = londonToUtc(date, time).getTime();
  return { valid_from: new Date(start - LEAD_BEFORE_H * 3600e3).toISOString(), valid_to: new Date(start + LEAD_AFTER_H * 3600e3).toISOString() };
}

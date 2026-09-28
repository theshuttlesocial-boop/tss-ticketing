// Interpret a session's YYYY-MM-DD + HH:MM as Europe/London local time and
// return the equivalent UTC Date (handles BST/GMT automatically).
export function ukSessionStartUTC(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = (timeStr ?? '00:00').split(':').map(Number)
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi))
  const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(guess)
  const ukH = parseInt(ukParts.find(p => p.type === 'hour')!.value)
  const ukMi = parseInt(ukParts.find(p => p.type === 'minute')!.value)
  const diffMs = ((h - ukH) * 60 + (mi - ukMi)) * 60000
  return new Date(guess.getTime() + diffMs)
}

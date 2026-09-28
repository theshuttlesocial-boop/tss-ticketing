/**
 * One plain-English line per change-log row, e.g.
 *   "Before R6 · Admin · Joe Suganthan Standard → Intermediate"
 * Pure, shared by the admin Log tab and tests.
 */
export type LogEvent =
  | 'score' | 'undo' | 'override'
  | 'level' | 'start_level' | 'level_lock'
  | 'added' | 'left' | 'removed' | 'rejoined'
  | 'substitute' | 'unknown_substitute'
  | 'finish' | 'reopen' | 'registration' | 'config' | 'attention';

export interface LogRow {
  id?: string;
  round: number | null;
  court: number | null;
  event: LogEvent;
  actor?: string | null;
  old_a?: number | null; old_b?: number | null; new_a?: number | null; new_b?: number | null;
  detail?: any;
  created_at?: string;
}

const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : '?');
const score = (a?: number | null, b?: number | null) => (a == null || b == null ? '—' : `${a}–${b}`);
const who = (actor?: string | null) =>
  !actor || actor === 'admin' ? 'Admin' : actor === 'system' ? 'System' : `Staff ${actor.slice(0, 8)}`;

export function describe(r: LogRow): { when: string; who: string; what: string } {
  const d = r.detail ?? {};
  const at = r.round != null ? (r.court != null ? `R${r.round} C${r.court}` : `R${r.round}`) : 'Session';
  let when = at;
  let what: string;
  switch (r.event) {
    case 'score':
      what = r.old_a == null ? `Score entered ${score(r.new_a, r.new_b)}`
        : `Score changed ${score(r.old_a, r.old_b)} → ${score(r.new_a, r.new_b)}`;
      break;
    case 'undo': what = `Round undone — ${score(r.old_a, r.old_b)} discarded`; break;
    case 'override':
      what = d.pastGame
        ? `Played by someone else: ${d.to ?? '?'} played for ${d.from ?? '?'}`
        : `Swap players: ${d.from ?? '?'} → ${d.to ?? '?'}`;
      break;
    case 'level':
      when = r.round != null ? `Before R${r.round}` : 'Before the first round';
      what = `${d.name} ${cap(d.from)} → ${cap(d.to)}${d.reason ? ` (${d.reason})` : ''}`;
      break;
    case 'start_level':
      what = `${d.name}: starting level corrected ${cap(d.from)} → ${cap(d.to)}, ratings recalculated from game 1`;
      break;
    case 'level_lock': what = `${d.name}: level ${d.locked ? 'locked' : 'unlocked'}`; break;
    case 'added': what = `${d.name} added as ${cap(d.level)}`; break;
    case 'left': what = `${d.name} left the session`; break;
    case 'removed': what = `${d.name} removed (had not played)`; break;
    case 'rejoined': what = `${d.name} brought back`; break;
    case 'substitute':
      what = d.recordedOnly
        ? `${d.substitute} played for ${d.leaver} (recorded afterwards; ratings not changed)`
        : `${d.substitute} plays in place of ${d.leaver}`;
      break;
    case 'unknown_substitute':
      what = d.on === false
        ? `${d.name}'s game counts for them again`
        : `Unknown substitute played for ${d.name} — game left out of their rating`;
      break;
    case 'finish': what = 'Session finished, registration closed'; break;
    case 'reopen': what = 'Session reopened'; break;
    case 'registration': what = `Registration ${d.open ? 'opened' : 'closed'}`; break;
    case 'config': what = d.latest ? 'Settings reset to the latest defaults' : 'Settings changed'; break;
    case 'attention': what = d.text ?? 'Needs-attention item dismissed'; break;
    default: what = String(r.event);
  }
  return { when, who: who(r.actor), what };
}

export const describeLine = (r: LogRow) => { const x = describe(r); return `${x.when} · ${x.who} · ${x.what}`; };

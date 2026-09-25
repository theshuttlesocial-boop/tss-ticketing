/**
 * Short court-list names: first name alone where that is unambiguous.
 *
 * Court lists are read at a glance from across a hall, so "Saranya" beats
 * "Saranya Sundar". Collisions are resolved with the least surname needed:
 *
 *   Harry Thuva                    -> Harry
 *   Sam Smith / Sam Stone          -> Sam Sm / Sam St
 *   Mo Ali / Mo Ahmed              -> Mo Al / Mo Ah
 *   Jo Patel / Jo Patel            -> Jo Patel (1) / Jo Patel (2)
 *   Nitharshan (no surname) x2     -> Nitharshan (1) / Nitharshan (2)
 */

const firstOf = (full: string) => full.trim().split(/\s+/)[0] ?? full;
const restOf = (full: string) => full.trim().split(/\s+/).slice(1).join(' ');
/** People type names inconsistently ("mo ali"); the court list should not. */
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function displayNames(
  players: { id: string; name: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};

  // Bucket by first name; anyone alone in their bucket keeps just that.
  const byFirst = new Map<string, { id: string; name: string }[]>();
  for (const p of players) {
    const k = firstOf(p.name).toLowerCase();
    byFirst.set(k, [...(byFirst.get(k) ?? []), p]);
  }

  for (const group of byFirst.values()) {
    if (group.length === 1) {
      out[group[0].id] = firstOf(group[0].name);
      continue;
    }

    // Lengthen the surname prefix until every label in the group is distinct,
    // so two Sams become "Sam S" only if that already separates them.
    let len = 1;
    let labels = new Map<string, string>();
    const maxLen = Math.max(...group.map((p) => restOf(p.name).length), 0);

    for (; len <= maxLen; len++) {
      labels = new Map(
        group.map((p) => {
          const surname = restOf(p.name);
          const prefix = cap(surname.slice(0, len));
          return [p.id, prefix ? `${firstOf(p.name)} ${prefix}` : firstOf(p.name)];
        }),
      );
      const seen = new Set([...labels.values()].map((v) => v.toLowerCase()));
      if (seen.size === group.length) break;
    }

    if (labels.size === 0 || new Set([...labels.values()].map((v) => v.toLowerCase())).size !== group.length) {
      // Identical or missing surnames — number them, in a stable order.
      const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
      ordered.forEach((p, i) => {
        const surname = restOf(p.name);
        out[p.id] = `${firstOf(p.name)}${surname ? ' ' + cap(surname) : ''} (${i + 1})`;
      });
      continue;
    }

    for (const [id, label] of labels) out[id] = label;
  }

  return out;
}

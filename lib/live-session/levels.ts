import type { Level } from './engine';

/** Shown to players when they pick their own level. */
export const LEVEL_INFO: { level: Level; dot: string; label: string; blurb: string }[] = [
  { level: 'beginner', dot: '#3fb950', label: 'Beginner',
    blurb: 'Never played, or very little experience. Still learning the basics.' },
  { level: 'standard', dot: '#4a9eff', label: 'Standard',
    blurb: 'Played a few times. Know the rules and can manage short rallies.' },
  { level: 'intermediate', dot: '#e09040', label: 'Intermediate',
    blurb: 'Play occasionally. Can hold a decent rally and play comfortably in a full game.' },
  { level: 'strong', dot: '#e05555', label: 'Strong',
    blurb: 'Play regularly. Confident with rallies, movement, shots and positioning.' },
];

export const LEVELS = LEVEL_INFO.map((l) => l.level);
